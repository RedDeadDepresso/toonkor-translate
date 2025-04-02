from django.contrib import admin

from django_backend.models import Chapter, Manhwa, ToonkorSettings


# Register your models here.


admin.site.register(Manhwa)
admin.site.register(Chapter)
admin.site.register(ToonkorSettings)
