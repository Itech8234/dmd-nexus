# The field (field-official) client UI is now served by the Next.js app
# (frontend/). This Django app previously rendered the prototype HTML pages;
# those views are removed. If field-specific server logic is needed later it
# belongs in the API apps (reports/incidents/officials) — the field app no
# longer serves any Django templates.
