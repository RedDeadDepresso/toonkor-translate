import json

from comic import *
from modules.utils.file_handler import FileHandler
from modules.utils.pipeline_utils import validate_settings
from pipeline import *
from PySide6.QtCore import QUrl
from PySide6.QtWebSockets import QWebSocket
from typing import Union


class Manhwa:
    def __init__(self, name) -> None:
        self.name: str = name
        self.chapters_dict: dict[str, dict[str, Union[set[str], bool]]] = {}
        self.progress = {'current': 0, 'total': 0}

    @property
    def progress_current(self) -> int:
        return self.progress['current']
    
    @progress_current.setter
    def progress_current(self, value: int):
        self.progress['current'] = value
    
    @property
    def progress_total(self) -> int:
        return self.progress['total']

    @progress_total.setter
    def progress_total(self, value: int):
        self.progress['total'] = value

    def get_page_paths(self, chapter: str) -> set[str]:
        info = self.chapters_dict.setdefault(chapter, {'page_paths': set(), 'translated': False})
        return info['page_paths']

    def is_translated(self, chapter: str) -> bool:
        info = self.chapters_dict.setdefault(chapter, {'page_paths': set(), 'translated': False})
        return info['translated']
    
    def get_chapter(self, chapter: str) -> tuple[set[str], bool]:
        info = self.chapters_dict.setdefault(chapter, {'page_paths': set(), 'translated': False})
        return info['page_paths'], info['translated']

    def update_chapter(self, chapter: str, page_paths: set[str] = None, translated: bool = None):
        info = self.chapters_dict.setdefault(chapter, {'page_paths': set(), 'translated': False})
        if page_paths is not None:
            info['page_paths'].update(page_paths)
        if translated is not None:
            info['translated'] = translated

    def remove_chapter(self, chapter):
        self.chapters_dict.pop(chapter, None)

    def update_progress(self) -> dict:
        self.progress_current = len([x for x in self.chapters_dict.values() if x['translated']])
        self.progress_total = len(self.chapters_dict)
        return self.progress
    
    def next_chapter(self):
        for index in self.chapters_dict:
            return self, index
        return None


class ManhwaFileHandler(FileHandler):
    def sanitize_and_copy_files(self, file_paths):
        return file_paths


class ManhwaPipeline(ComicTranslatePipeline):
    def skip_save(self, directory, timestamp, base_name, extension, archive_bname, image):
        path = os.path.join(directory, "translated", archive_bname)
        if not os.path.exists(path):
            os.makedirs(path, exist_ok=True)
        cv2.imwrite(os.path.join(path, f"{base_name}{extension}"), image)

    def log_skipped_image(self, directory, timestamp, image_path):
        with open(os.path.join(directory, f"translated", "skipped_images.txt"), 'a', encoding='UTF-8') as file:
            file.write(image_path + "\n")

    def batch_process(self):
        timestamp = datetime.now().strftime("%b-%d-%Y_%I-%M-%S%p")
        total_images = len(self.main_page.image_files)

        for index, image_path in enumerate(self.main_page.image_files):

            # index, step, total_steps, change_name
            self.main_page.progress_update.emit(index, total_images, 0, 10, True)

            settings_page = self.main_page.settings_page
            source_lang = self.main_page.image_states[image_path]['source_lang']
            target_lang = self.main_page.image_states[image_path]['target_lang']

            target_lang_en = self.main_page.lang_mapping.get(target_lang, None)
            trg_lng_cd = get_language_code(target_lang_en)
            
            base_name = os.path.splitext(os.path.basename(image_path))[0]
            extension = os.path.splitext(image_path)[1]
            directory = os.path.dirname(image_path)

            archive_bname = ""
            for archive in self.main_page.file_handler.archive_info:
                images = archive['extracted_images']
                archive_path = archive['archive_path']

                for img_pth in images:
                    if img_pth == image_path:
                        directory = os.path.dirname(archive_path)
                        archive_bname = os.path.splitext(os.path.basename(archive_path))[0]

            image = cv2.imread(image_path)

            # Text Block Detection
            self.main_page.progress_update.emit(index, total_images, 1, 10, False)
            if self.main_page.current_worker and self.main_page.current_worker.is_cancelled:
                self.main_page.current_worker = None
                break

            if self.block_detector_cache is None:
                self.block_detector_cache = TextBlockDetector(self.main_page.settings_page)
            
            blk_list = self.block_detector_cache.detect(image)

            self.main_page.progress_update.emit(index, total_images, 2, 10, False)
            if self.main_page.current_worker and self.main_page.current_worker.is_cancelled:
                self.main_page.current_worker = None
                break

            if blk_list:
                self.ocr.initialize(self.main_page, source_lang)
                try:
                    self.ocr.process(image, blk_list)
                    source_lang_english = self.main_page.lang_mapping.get(source_lang, source_lang)
                    rtl = True if source_lang_english == 'Japanese' else False
                    blk_list = sort_blk_list(blk_list, rtl)
                except Exception as e:
                    error_message = str(e)
                    print(error_message)
                    self.skip_save(directory, timestamp, base_name, extension, archive_bname, image)
                    self.main_page.image_skipped.emit(image_path, "OCR", error_message)
                    self.log_skipped_image(directory, timestamp, image_path)
                    continue
            else:
                self.skip_save(directory, timestamp, base_name, extension, archive_bname, image)
                self.main_page.image_skipped.emit(image_path, "Text Blocks", "")
                self.log_skipped_image(directory, timestamp, image_path)
                continue

            self.main_page.progress_update.emit(index, total_images, 3, 10, False)
            if self.main_page.current_worker and self.main_page.current_worker.is_cancelled:
                self.main_page.current_worker = None
                break

            # Clean Image of text
            export_settings = settings_page.get_export_settings()

            if self.inpainter_cache is None or self.cached_inpainter_key != settings_page.get_tool_selection('inpainter'):
                device = 'cuda' if settings_page.is_gpu_enabled() else 'cpu'
                inpainter_key = settings_page.get_tool_selection('inpainter')
                InpainterClass = inpaint_map[inpainter_key]
                self.inpainter_cache = InpainterClass(device)
                self.cached_inpainter_key = inpainter_key

            config = get_config(settings_page)
            mask = generate_mask(image, blk_list)

            self.main_page.progress_update.emit(index, total_images, 4, 10, False)
            if self.main_page.current_worker and self.main_page.current_worker.is_cancelled:
                self.main_page.current_worker = None
                break

            inpaint_input_img = self.inpainter_cache(image, mask, config)
            inpaint_input_img = cv2.convertScaleAbs(inpaint_input_img)

            # Saving cleaned image
            self.main_page.image_history[image_path] = [image_path]
            self.main_page.current_history_index[image_path] = 0
            self.main_page.image_processed.emit(index, inpaint_input_img, image_path)

            inpaint_input_img = cv2.cvtColor(inpaint_input_img, cv2.COLOR_BGR2RGB)

            if export_settings['export_inpainted_image']:
                path = os.path.join(directory, f"comic_translate_{timestamp}", "cleaned_images", archive_bname)
                if not os.path.exists(path):
                    os.makedirs(path, exist_ok=True)
                cv2.imwrite(os.path.join(path, f"{base_name}_cleaned{extension}"), inpaint_input_img)

            self.main_page.progress_update.emit(index, total_images, 5, 10, False)
            if self.main_page.current_worker and self.main_page.current_worker.is_cancelled:
                self.main_page.current_worker = None
                break

            # Get Translations/ Export if selected
            extra_context = settings_page.get_llm_settings()['extra_context']
            translator = Translator(self.main_page, source_lang, target_lang)
            try:
                translator.translate(blk_list, image, extra_context)
            except Exception as e:
                error_message = str(e)
                print(error_message)
                self.skip_save(directory, timestamp, base_name, extension, archive_bname, image)
                self.main_page.image_skipped.emit(image_path, "Translator", error_message)
                self.log_skipped_image(directory, timestamp, image_path)
                continue

            entire_raw_text = get_raw_text(blk_list)
            entire_translated_text = get_raw_translation(blk_list)

            # Parse JSON strings and check if they're empty objects or invalid
            try:
                raw_text_obj = json.loads(entire_raw_text)
                translated_text_obj = json.loads(entire_translated_text)
                
                if (not raw_text_obj) or (not translated_text_obj):
                    self.skip_save(directory, timestamp, base_name, extension, archive_bname, image)
                    self.main_page.image_skipped.emit(image_path, "Translator", "")
                    self.log_skipped_image(directory, timestamp, image_path)
                    continue
            except json.JSONDecodeError as e:
                # Handle invalid JSON
                error_message = str(e)
                self.skip_save(directory, timestamp, base_name, extension, archive_bname, image)
                self.main_page.image_skipped.emit(image_path, "Translator", error_message)
                self.log_skipped_image(directory, timestamp, image_path)
                continue

            if export_settings['export_raw_text']:
                path = os.path.join(directory, f"comic_translate_{timestamp}", "raw_texts", archive_bname)
                if not os.path.exists(path):
                    os.makedirs(path, exist_ok=True)
                file = open(os.path.join(path, os.path.splitext(os.path.basename(image_path))[0] + "_raw.txt"), 'w', encoding='UTF-8')
                file.write(entire_raw_text)

            if export_settings['export_translated_text']:
                path = os.path.join(directory, f"comic_translate_{timestamp}", "translated_texts", archive_bname)
                if not os.path.exists(path):
                    os.makedirs(path, exist_ok=True)
                file = open(os.path.join(path, os.path.splitext(os.path.basename(image_path))[0] + "_translated.txt"), 'w', encoding='UTF-8')
                file.write(entire_translated_text)

            self.main_page.progress_update.emit(index, total_images, 7, 10, False)
            if self.main_page.current_worker and self.main_page.current_worker.is_cancelled:
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

                translation, font_size = pyside_word_wrap(translation, font, width, height,
                                                        line_spacing, outline_width, bold, italic, underline,
                                                        alignment, direction, max_font_size, min_font_size)
                
                # Display text if on current page
                if index == self.main_page.curr_img_idx:
                    self.main_page.blk_rendered.emit(translation, font_size, blk)

                if any(lang in trg_lng_cd.lower() for lang in ['zh', 'ja', 'th']):
                    translation = translation.replace(' ', '')

                text_items_state.append({
                'text': translation,
                'font_family': font,
                'font_size': font_size,
                'text_color': font_color,
                'alignment': alignment,
                'line_spacing': line_spacing,
                'outline_color': outline_color,
                'outline_width': outline_width,
                'bold': bold,
                'italic': italic,
                'underline': underline,
                'position': (x1, y1),
                'rotation': blk.angle,
                'scale': 1.0,
                'transform_origin': blk.tr_origin_point,
                'width': width,
                'direction': direction,
                'selection_outlines': [OutlineInfo(0, len(translation), 
                                                            outline_color, outline_width, 
                                                            OutlineType.Full_Document)] if outline else []
                })

            self.main_page.image_states[image_path]['viewer_state'].update({
                'text_items_state': text_items_state
                })
            
            self.main_page.progress_update.emit(index, total_images, 9, 10, False)
            if self.main_page.current_worker and self.main_page.current_worker.is_cancelled:
                self.main_page.current_worker = None
                break

            # Saving blocks with texts to history
            self.main_page.image_states[image_path].update({
                'blk_list': blk_list                   
            })

            if index == self.main_page.curr_img_idx:
                self.main_page.blk_list = blk_list

            # CHANGED: Save the rendered image to a different directory
            render_save_dir = os.path.join(directory, f"translated", archive_bname)
            if not os.path.exists(render_save_dir):
                os.makedirs(render_save_dir, exist_ok=True)
            sv_pth = os.path.join(render_save_dir, f"{base_name}{extension}")

            im = cv2.cvtColor(inpaint_input_img, cv2.COLOR_RGB2BGR)
            renderer = ImageSaveRenderer(im)
            viewer_state = self.main_page.image_states[image_path]['viewer_state']
            renderer.add_state_to_image(viewer_state)
            renderer.save_image(sv_pth)

            self.main_page.progress_update.emit(index, total_images, 10, 10, False)

        archive_info_list = self.main_page.file_handler.archive_info
        if archive_info_list:
            save_as_settings = settings_page.get_export_settings()['save_as']
            for archive_index, archive in enumerate(archive_info_list):
                archive_index_input = total_images + archive_index

                self.main_page.progress_update.emit(archive_index_input, total_images, 1, 3, True)
                if self.main_page.current_worker and self.main_page.current_worker.is_cancelled:
                    self.main_page.current_worker = None
                    break

                archive_path = archive['archive_path']
                archive_ext = os.path.splitext(archive_path)[1]
                archive_bname = os.path.splitext(os.path.basename(archive_path))[0]
                archive_directory = os.path.dirname(archive_path)
                save_as_ext = f".{save_as_settings[archive_ext.lower()]}"

                save_dir = os.path.join(archive_directory, f"comic_translate_{timestamp}", "translated_images", archive_bname)
                check_from = os.path.join(archive_directory, f"comic_translate_{timestamp}")

                self.main_page.progress_update.emit(archive_index_input, total_images, 2, 3, True)
                if self.main_page.current_worker and self.main_page.current_worker.is_cancelled:
                    self.main_page.current_worker = None
                    break

                # Create the new archive
                output_base_name = f"{archive_bname}"
                make(save_as_ext=save_as_ext, input_dir=save_dir, 
                    output_dir=archive_directory, output_base_name=output_base_name)

                self.main_page.progress_update.emit(archive_index_input, total_images, 3, 3, True)
                if self.main_page.current_worker and self.main_page.current_worker.is_cancelled:
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
        self.translation_queue: dict[str, Manhwa] = dict()

        self.websocket = QWebSocket()
        self.websocket.connected.connect(self.on_connected)
        self.websocket.disconnected.connect(self.on_disconnected)
        self.websocket.textMessageReceived.connect(self.receive_message)
        self.ready_event = ready_event

        self.connect_to_server()

    def connect_to_server(self):
        self.websocket.open(QUrl('ws://127.0.0.1:8000/ws/qt/'))

    def on_connected(self):
        print("ComicTranslate connected to WebSocket server")
        if self.ready_event:
            self.ready_event.set()

    def on_disconnected(self):
        print("ComicTranslate disconnected from WebSocket server")

    def receive_message(self, message):
        data = json.loads(message)
        restart =  len(self.translation_queue) == 0
        for toonkor_id, chapters in data.items():
            manhwa = self.translation_queue.setdefault(toonkor_id, Manhwa(toonkor_id))
            for chapter, details in chapters.items():
                page_paths = details['page_paths']
                manhwa.update_chapter(chapter, page_paths=page_paths)
        if restart:
            self.next_manhwa()

    def next_manhwa(self):
        for manhwa in self.translation_queue.values():
            next_chapter = manhwa.next_chapter()
            if next_chapter is not None:
                self.translate_chapter(*next_chapter)

    def translate_chapter(self, manhwa: Manhwa, chapter: str):
        page_paths, translated = manhwa.get_chapter(chapter)
        if translated:
            self.send_progress(manhwa, chapter)
        else:
            start_chapter_translate = lambda x=manhwa, y=chapter: self.start_chapter_translate(x, y)
            result_callback = lambda x: (self.on_initial_image_loaded(x), start_chapter_translate())
            self.run_threaded(self.load_initial_image, result_callback, self.default_error_handler, None, page_paths)

    def start_chapter_translate(self, manhwa: Manhwa, chapter: str):
        for image_path in self.image_files:
            source_lang = self.image_states[image_path]['source_lang']
            target_lang = self.image_states[image_path]['target_lang']

            if not validate_settings(self, source_lang, target_lang):
                return
        
        self.batch_mode_selected()
        self.translate_button.setEnabled(False)
        self.progress_bar.setVisible(True)
        finished_callback = lambda x=manhwa, y=chapter: self.on_chapter_translate_finished(x, y)
        self.run_threaded(self.pipeline.batch_process, None, self.default_error_handler, finished_callback)

    def send_progress(self, manhwa: Manhwa, chapter: str):
        manhwa.update_chapter(chapter, translated=True)
        progress = manhwa.update_progress()
        reply = json.dumps({'task': 'download_translate', 
                            'toonkor_id': manhwa.name, 
                            'chapter': chapter, 
                            'progress': progress})
        self.websocket.sendTextMessage(reply)

    def on_chapter_translate_finished(self, manhwa: Manhwa, chapter: str):
        self.progress_bar.setVisible(False)
        self.translate_button.setEnabled(True)
        self.send_progress(manhwa, chapter)
        manhwa.remove_chapter(chapter)
        if len(manhwa.chapters_dict) == 0:
            self.translation_queue.pop(manhwa.name, None)
        self.next_manhwa()


def run_comic_translate(ready_event):
    import sys
    from PySide6.QtGui import QIcon
    from app.ui.dayu_widgets.qt import application
    from app.translations import ct_translations
    from app import icon_resource
    from PySide6.QtCore import QSettings

    if sys.platform == "win32":
        # Necessary Workaround to set to Taskbar Icon on Windows
        import ctypes
        myappid = u'ComicLabs.ComicTranslate'  # arbitrary string
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)

    with application() as app:
        # Set the application icon
        icon = QIcon(":/icons/window_icon.png")
        app.setWindowIcon(icon)

        settings = QSettings("ComicLabs", "ComicTranslate")
        selected_language = settings.value('language', get_system_language())
        if selected_language != 'English':
            load_translation(app, selected_language)

        ctd = ComicTranslateDjango(ready_event=ready_event)
        ctd.show()


if __name__ == "__main__":
    run_comic_translate()