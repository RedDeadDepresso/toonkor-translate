# Generated by Django 5.1 on 2024-09-05 05:18

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("toonkor_collector2", "0007_manhwa_mangadex_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="manhwa",
            name="chapters_num",
            field=models.IntegerField(default=0),
        ),
    ]
