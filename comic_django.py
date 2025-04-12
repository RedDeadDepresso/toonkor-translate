import json
import time

import django
from PySide6.QtCore import QUrl
from PySide6.QtWebSockets import QWebSocket

from comic import *
from modules.utils.file_handler import FileHandler
from modules.utils.pipeline_utils import validate_settings
from pipeline import *


os.environ.setdefault("DJANGO_SETTINGS_MODULE", "django_project.settings")
django.setup()

from django_backend.models import Chapter, StatusChoices, ToonkorSettings


class ManhwaFileHandler(FileHandler):
    def sanitize_and_copy_files(self, file_paths):
        return file_paths


class Scheduler:
    def __init__(self):
        toonkor_settings, _ = ToonkorSettings.objects.get_or_create("main")
        self._page_count = 0
        self.page_limit = toonkor_settings.translation_page_limit

        self._start_time = 0
        self.duration_limit = 60  # 1 minute in seconds
        self._time_offset = 10

    def start(self):
        if not self.started():
            self._start_time = time.time()
            self._page_count = 0

        return self

    def started(self):
        return bool(self._start_time)

    def duration(self):
        """
        Returns:
            float
        """
        if self.started():
            return time.time() - self._start_time
        else:
            return 0.0

    def check(self):
        """
        Wait until timer reached.
        """
        self._page_count += 1

        if self._page_count == self.page_limit:
            self._page_count = 0
            duration = self.duration()

            if duration < self.duration_limit:
                waiting_time = self.duration_limit - duration + self._time_offset
                self._start_time = 0
                time.sleep(waiting_time)
                return

            start_time_offset = (duration % self.duration_limit) + self._time_offset
            self._start_time = time.time() - start_time_offset


class ManhwaPipeline(ComicTranslatePipeline):
    def __init__(self, main_page):
        super().__init__(main_page)
        self.scheduler = Scheduler()

    def skip_save(
        self, directory, timestamp, base_name, extension, archive_bname, image
    ):
        path = os.path.join(directory, "translated", archive_bname)
        if not os.path.exists(path):
            os.makedirs(path, exist_ok=True)
        cv2.imwrite(os.path.join(path, f"{base_name}{extension}"), image)

    def log_skipped_image(self, directory, timestamp, image_path):
        with open(
            os.path.join(directory, "translated", "skipped_images.txt"),
            "a",
            encoding="UTF-8",
        ) as file:
            file.write(image_path + "\n")

    def batch_process(self):
        timestamp = datetime.now().strftime("%b-%d-%Y_%I-%M-%S%p")
        total_images = len(self.main_page.image_files)

        self.scheduler.start()
        for index, image_path in enumerate(self.main_page.image_files):
            # index, step, total_steps, change_name
            self.main_page.progress_update.emit(index, total_images, 0, 10, True)

            settings_page = self.main_page.settings_page
            source_lang = self.main_page.image_states[image_path]["source_lang"]
            target_lang = self.main_page.image_states[image_path]["target_lang"]

            target_lang_en = self.main_page.lang_mapping.get(target_lang, None)
            trg_lng_cd = get_language_code(target_lang_en)

            base_name = os.path.splitext(os.path.basename(image_path))[0]
            extension = os.path.splitext(image_path)[1]
            directory = os.path.dirname(image_path)

            archive_bname = ""
            for archive in self.main_page.file_handler.archive_info:
                images = archive["extracted_images"]
                archive_path = archive["archive_path"]

                for img_pth in images:
                    if img_pth == image_path:
                        directory = os.path.dirname(archive_path)
                        archive_bname = os.path.splitext(
                            os.path.basename(archive_path)
                        )[0]

            image = cv2.imread(image_path)

            # Text Block Detection
            self.main_page.progress_update.emit(index, total_images, 1, 10, False)
            if (
                self.main_page.current_worker
                and self.main_page.current_worker.is_cancelled
            ):
                self.main_page.current_worker = None
                break

            if self.block_detector_cache is None:
                self.block_detector_cache = TextBlockDetector(
                    self.main_page.settings_page
                )

            blk_list = self.block_detector_cache.detect(image)

            self.main_page.progress_update.emit(index, total_images, 2, 10, False)
            if (
                self.main_page.current_worker
                and self.main_page.current_worker.is_cancelled
            ):
                self.main_page.current_worker = None
                break

            if blk_list:
                self.ocr.initialize(self.main_page, source_lang)
                try:
                    self.ocr.process(image, blk_list)
                    source_lang_english = self.main_page.lang_mapping.get(
                        source_lang, source_lang
                    )
                    rtl = True if source_lang_english == "Japanese" else False
                    blk_list = sort_blk_list(blk_list, rtl)
                except Exception as e:
                    error_message = str(e)
                    print(error_message)
                    self.skip_save(
                        directory, timestamp, base_name, extension, archive_bname, image
                    )
                    self.main_page.image_skipped.emit(image_path, "OCR", error_message)
                    self.log_skipped_image(directory, timestamp, image_path)
                    continue
            else:
                self.skip_save(
                    directory, timestamp, base_name, extension, archive_bname, image
                )
                self.main_page.image_skipped.emit(image_path, "Text Blocks", "")
                self.log_skipped_image(directory, timestamp, image_path)
                continue

            self.main_page.progress_update.emit(index, total_images, 3, 10, False)
            if (
                self.main_page.current_worker
                and self.main_page.current_worker.is_cancelled
            ):
                self.main_page.current_worker = None
                break

            # Clean Image of text
            export_settings = settings_page.get_export_settings()

            if (
                self.inpainter_cache is None
                or self.cached_inpainter_key
                != settings_page.get_tool_selection("inpainter")
            ):
                device = "cuda" if settings_page.is_gpu_enabled() else "cpu"
                inpainter_key = settings_page.get_tool_selection("inpainter")
                InpainterClass = inpaint_map[inpainter_key]
                self.inpainter_cache = InpainterClass(device)
                self.cached_inpainter_key = inpainter_key

            config = get_config(settings_page)
            mask = generate_mask(image, blk_list)

            self.main_page.progress_update.emit(index, total_images, 4, 10, False)
            if (
                self.main_page.current_worker
                and self.main_page.current_worker.is_cancelled
            ):
                self.main_page.current_worker = None
                break

            inpaint_input_img = self.inpainter_cache(image, mask, config)
            inpaint_input_img = cv2.convertScaleAbs(inpaint_input_img)

            # Saving cleaned image
            self.main_page.image_history[image_path] = [image_path]
            self.main_page.current_history_index[image_path] = 0
            self.main_page.image_processed.emit(index, inpaint_input_img, image_path)

            inpaint_input_img = cv2.cvtColor(inpaint_input_img, cv2.COLOR_BGR2RGB)

            if export_settings["export_inpainted_image"]:
                path = os.path.join(
                    directory,
                    f"comic_translate_{timestamp}",
                    "cleaned_images",
                    archive_bname,
                )
                if not os.path.exists(path):
                    os.makedirs(path, exist_ok=True)
                cv2.imwrite(
                    os.path.join(path, f"{base_name}_cleaned{extension}"),
                    inpaint_input_img,
                )

            self.main_page.progress_update.emit(index, total_images, 5, 10, False)
            if (
                self.main_page.current_worker
                and self.main_page.current_worker.is_cancelled
            ):
                self.main_page.current_worker = None
                break

            # Get Translations/ Export if selected
            extra_context = settings_page.get_llm_settings()["extra_context"]
            translator = Translator(self.main_page, source_lang, target_lang)
            try:
                translator.translate(blk_list, image, extra_context)
            except Exception as e:
                error_message = str(e)
                print(error_message)
                self.skip_save(
                    directory, timestamp, base_name, extension, archive_bname, image
                )
                self.main_page.image_skipped.emit(
                    image_path, "Translator", error_message
                )
                self.log_skipped_image(directory, timestamp, image_path)
                continue

            entire_raw_text = get_raw_text(blk_list)
            entire_translated_text = get_raw_translation(blk_list)

            # Parse JSON strings and check if they're empty objects or invalid
            try:
                raw_text_obj = json.loads(entire_raw_text)
                translated_text_obj = json.loads(entire_translated_text)

                if (not raw_text_obj) or (not translated_text_obj):
                    self.skip_save(
                        directory, timestamp, base_name, extension, archive_bname, image
                    )
                    self.main_page.image_skipped.emit(image_path, "Translator", "")
                    self.log_skipped_image(directory, timestamp, image_path)
                    continue
            except json.JSONDecodeError as e:
                # Handle invalid JSON
                error_message = str(e)
                self.skip_save(
                    directory, timestamp, base_name, extension, archive_bname, image
                )
                self.main_page.image_skipped.emit(
                    image_path, "Translator", error_message
                )
                self.log_skipped_image(directory, timestamp, image_path)
                continue

            if export_settings["export_raw_text"]:
                path = os.path.join(
                    directory,
                    f"comic_translate_{timestamp}",
                    "raw_texts",
                    archive_bname,
                )
                if not os.path.exists(path):
                    os.makedirs(path, exist_ok=True)
                file = open(
                    os.path.join(
                        path,
                        os.path.splitext(os.path.basename(image_path))[0] + "_raw.txt",
                    ),
                    "w",
                    encoding="UTF-8",
                )
                file.write(entire_raw_text)

            if export_settings["export_translated_text"]:
                path = os.path.join(
                    directory,
                    f"comic_translate_{timestamp}",
                    "translated_texts",
                    archive_bname,
                )
                if not os.path.exists(path):
                    os.makedirs(path, exist_ok=True)
                file = open(
                    os.path.join(
                        path,
                        os.path.splitext(os.path.basename(image_path))[0]
                        + "_translated.txt",
                    ),
                    "w",
                    encoding="UTF-8",
                )
                file.write(entire_translated_text)

            self.main_page.progress_update.emit(index, total_images, 7, 10, False)
            if (
                self.main_page.current_worker
                and self.main_page.current_worker.is_cancelled
            ):
                self.main_page.current_worker = None
                break

            # Text Rendering
            render_settings = self.main_page.render_settings()
            upper_case = render_settings.upper_case
            outline = render_settings.outline
            format_translations(blk_list, trg_lng_cd, upper_case=upper_case)
            get_best_render_area(blk_list, image, inpaint_input_img)

            font = render_settings.font_family
            font_color = QColor(render_settings.color)

            max_font_size = render_settings.max_font_size
            min_font_size = render_settings.min_font_size
            line_spacing = float(render_settings.line_spacing)
            outline_width = float(render_settings.outline_width)
            outline_color = QColor(render_settings.outline_color)
            bold = render_settings.bold
            italic = render_settings.italic
            underline = render_settings.underline
            alignment_id = render_settings.alignment_id
            alignment = self.main_page.button_to_alignment[alignment_id]
            direction = render_settings.direction

            text_items_state = []
            for blk in blk_list:
                x1, y1, width, height = blk.xywh

                translation = blk.translation
                if not translation or len(translation) == 1:
                    continue

                translation, font_size = pyside_word_wrap(
                    translation,
                    font,
                    width,
                    height,
                    line_spacing,
                    outline_width,
                    bold,
                    italic,
                    underline,
                    alignment,
                    direction,
                    max_font_size,
                    min_font_size,
                )

                # Display text if on current page
                if index == self.main_page.curr_img_idx:
                    self.main_page.blk_rendered.emit(translation, font_size, blk)

                if any(lang in trg_lng_cd.lower() for lang in ["zh", "ja", "th"]):
                    translation = translation.replace(" ", "")

                text_items_state.append(
                    {
                        "text": translation,
                        "font_family": font,
                        "font_size": font_size,
                        "text_color": font_color,
                        "alignment": alignment,
                        "line_spacing": line_spacing,
                        "outline_color": outline_color,
                        "outline_width": outline_width,
                        "bold": bold,
                        "italic": italic,
                        "underline": underline,
                        "position": (x1, y1),
                        "rotation": blk.angle,
                        "scale": 1.0,
                        "transform_origin": blk.tr_origin_point,
                        "width": width,
                        "direction": direction,
                        "selection_outlines": [
                            OutlineInfo(
                                0,
                                len(translation),
                                outline_color,
                                outline_width,
                                OutlineType.Full_Document,
                            )
                        ]
                        if outline
                        else [],
                    }
                )

            self.main_page.image_states[image_path]["viewer_state"].update(
                {"text_items_state": text_items_state}
            )

            self.main_page.progress_update.emit(index, total_images, 9, 10, False)
            if (
                self.main_page.current_worker
                and self.main_page.current_worker.is_cancelled
            ):
                self.main_page.current_worker = None
                break

            # Saving blocks with texts to history
            self.main_page.image_states[image_path].update({"blk_list": blk_list})

            if index == self.main_page.curr_img_idx:
                self.main_page.blk_list = blk_list

            # CHANGED: Save the rendered image to a different directory
            render_save_dir = os.path.join(directory, "translated", archive_bname)
            if not os.path.exists(render_save_dir):
                os.makedirs(render_save_dir, exist_ok=True)
            sv_pth = os.path.join(render_save_dir, f"{base_name}{extension}")

            im = cv2.cvtColor(inpaint_input_img, cv2.COLOR_RGB2BGR)
            renderer = ImageSaveRenderer(im)
            viewer_state = self.main_page.image_states[image_path]["viewer_state"]
            renderer.add_state_to_image(viewer_state)
            renderer.save_image(sv_pth)

            self.main_page.progress_update.emit(index, total_images, 10, 10, False)

            self.scheduler.check()

        archive_info_list = self.main_page.file_handler.archive_info
        if archive_info_list:
            save_as_settings = settings_page.get_export_settings()["save_as"]
            for archive_index, archive in enumerate(archive_info_list):
                archive_index_input = total_images + archive_index

                self.main_page.progress_update.emit(
                    archive_index_input, total_images, 1, 3, True
                )
                if (
                    self.main_page.current_worker
                    and self.main_page.current_worker.is_cancelled
                ):
                    self.main_page.current_worker = None
                    break

                archive_path = archive["archive_path"]
                archive_ext = os.path.splitext(archive_path)[1]
                archive_bname = os.path.splitext(os.path.basename(archive_path))[0]
                archive_directory = os.path.dirname(archive_path)
                save_as_ext = f".{save_as_settings[archive_ext.lower()]}"

                save_dir = os.path.join(
                    archive_directory,
                    f"comic_translate_{timestamp}",
                    "translated_images",
                    archive_bname,
                )
                check_from = os.path.join(
                    archive_directory, f"comic_translate_{timestamp}"
                )

                self.main_page.progress_update.emit(
                    archive_index_input, total_images, 2, 3, True
                )
                if (
                    self.main_page.current_worker
                    and self.main_page.current_worker.is_cancelled
                ):
                    self.main_page.current_worker = None
                    break

                # Create the new archive
                output_base_name = f"{archive_bname}"
                make(
                    save_as_ext=save_as_ext,
                    input_dir=save_dir,
                    output_dir=archive_directory,
                    output_base_name=output_base_name,
                )

                self.main_page.progress_update.emit(
                    archive_index_input, total_images, 3, 3, True
                )
                if (
                    self.main_page.current_worker
                    and self.main_page.current_worker.is_cancelled
                ):
                    self.main_page.current_worker = None
                    break

                # Clean up temporary
                if os.path.exists(save_dir):
                    shutil.rmtree(save_dir)
                # The temp dir is removed when closing the app

                if is_directory_empty(check_from):
                    shutil.rmtree(check_from)


class ComicTranslateDjango(ComicTranslate):
    def __init__(self, parent=None, ready_event=None):
        super(ComicTranslateDjango, self).__init__(parent)
        self.file_handler = ManhwaFileHandler()
        self.pipeline = ManhwaPipeline(self)
        self.current_chaper: Chapter | None = None

        self.websocket = QWebSocket()
        self.websocket.connected.connect(self.on_connected)
        self.websocket.disconnected.connect(self.on_disconnected)
        self.websocket.textMessageReceived.connect(self.translate_chapter)
        self.ready_event = ready_event

        self.connect_to_server()
        self.translate_chapter()

    def connect_to_server(self):
        self.websocket.open(QUrl("ws://127.0.0.1:8000/ws/qt/"))

    def on_connected(self):
        print("ComicTranslate connected to WebSocket server")
        if self.ready_event:
            self.ready_event.set()

    def on_disconnected(self):
        print("ComicTranslate disconnected from WebSocket server")

    def translate_chapter(self, message=None):
        if not self.current_chaper:
            self.current_chaper = (
                Chapter.objects.filter(
                    download_status=StatusChoices.READY,
                    translation_status=StatusChoices.LOADING,
                )
                .order_by("last_edit", "index")
                .first()
            )

        if self.current_chaper:
            self.run_threaded(
                self.load_initial_image,
                self.start_chapter_translate,
                self.default_error_handler,
                None,
                self.current_chaper.download_pages,
            )

    def start_chapter_translate(self, cv2_image):
        self.on_initial_image_loaded(cv2_image)
        for image_path in self.image_files:
            source_lang = self.image_states[image_path]["source_lang"]
            target_lang = self.image_states[image_path]["target_lang"]

            if not validate_settings(self, source_lang, target_lang):
                return

        self.batch_mode_selected()
        self.translate_button.setEnabled(False)
        self.progress_bar.setVisible(True)
        self.run_threaded(
            self.pipeline.batch_process,
            None,
            self.default_error_handler,
            self.on_chapter_translate_finished,
        )

    def send_progress(self):
        reply = json.dumps(
            {
                "task": "download_translate",
                "toonkor_id": self.current_chaper.manhwa.toonkor_id,
                "chapter": self.current_chaper.index,
            }
        )
        self.websocket.sendTextMessage(reply)

    def on_chapter_translate_finished(self):
        self.progress_bar.setVisible(False)
        self.translate_button.setEnabled(True)
        self.current_chaper.translation_status = StatusChoices.READY
        self.current_chaper.save()
        self.send_progress()
        self.current_chaper = None
        self.translate_chapter()


def run_comic_translate(ready_event):
    import sys

    from PySide6.QtCore import QSettings
    from PySide6.QtGui import QIcon

    from app.ui.dayu_widgets.qt import application

    if sys.platform == "win32":
        # Necessary Workaround to set to Taskbar Icon on Windows
        import ctypes

        myappid = "ComicLabs.ComicTranslate"  # arbitrary string
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)

    with application() as app:
        # Set the application icon
        icon = QIcon(":/icons/window_icon.png")
        app.setWindowIcon(icon)

        settings = QSettings("ComicLabs", "ComicTranslate")
        selected_language = settings.value("language", get_system_language())
        if selected_language != "English":
            load_translation(app, selected_language)

        ctd = ComicTranslateDjango(ready_event=ready_event)
        ctd.show()


if __name__ == "__main__":
    run_comic_translate()
