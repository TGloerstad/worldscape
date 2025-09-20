# WorldScape UI (local)

## Prereqs
- R with plumber, assignR, terra (installed via renv + install.packages)
- macOS geospatial libs: `brew install gdal geos proj`

## R API (from repo root)
- Start server:
```
R -q -e "pr <- plumber::pr('FTMapping/api.R'); plumber::pr_run(pr, host='0.0.0.0', port=8000)"
```
- Health: `curl http://localhost:8000/health`

## Next.js UI
- Set env (optional): create `.env.local` with `R_API_URL=http://localhost:8000`
- Start dev server:
```
cd worldscape-ui
npm run dev
```
Open http://localhost:3000

Upload an .xlsx and the UI will call the R API `/run` and show a JSON list of outputs. Outputs are written under `FTMapping/output/`.
