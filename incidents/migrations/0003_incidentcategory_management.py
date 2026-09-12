from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("incidents", "0002_incident_unique_client_incident_per_reporter"),
    ]

    operations = [
        migrations.AddField(
            model_name="incidentcategory",
            name="created_at",
            field=models.DateTimeField(
                auto_now_add=True,
            ),
        ),
        migrations.AddField(
            model_name="incidentcategory",
            name="description",
            field=models.TextField(
                blank=True,
                help_text="What this category covers — shown in forms and the admin panel.",
            ),
        ),
        migrations.AddField(
            model_name="incidentcategory",
            name="is_active",
            field=models.BooleanField(
                default=True,
                help_text="Inactive categories are hidden from new incident forms but keep their historical incidents.",
            ),
        ),
        migrations.AlterModelOptions(
            name="incidentcategory",
            options={"ordering": ["name"], "verbose_name_plural": "Incident categories"},
        ),
    ]