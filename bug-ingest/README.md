# Bug Catcher — Bug Ingest Service

Self-hosted web service for receiving bug reports from Godot games. Stores reports in SQLite and exposes an API for the local processor to pull unprocessed reports.

## Quick Start

```bash
cd /home/d_msl/workspace/godot-bug-catcher/bug-ingest
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8421
```

## API Endpoints

### Receive Report
`POST /api/v1/report` — Accept a bug report from Godot client (JSON body)

### Upload Attachment
`POST /api/v1/upload` — Upload screenshot/log file for a report

### List Reports
`GET /api/v1/reports?processed=0&type=crash&limit=50&offset=0`

### Get Report
`GET /api/v1/reports/{report_id}`

### Update Group
`PUT /api/v1/reports/{report_id}/group` — Update group status

### Processor Endpoints
- `GET /api/v1/processor/unprocessed` — Pull unprocessed reports
- `POST /api/v1/processor/group` — Claim reports into a group
- `GET /api/v1/groups` — List bug groups for triage

### Health
`GET /api/v1/health`

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| DB_PATH | `data/bug_catcher.db` | SQLite database location |
| UPLOAD_DIR | `uploads/` | Directory for screenshots/logs |
| PORT | 8421 | HTTP server port |

## Database

SQLite with WAL mode. Schema in `schema.sql`. Three tables:
- `reports` — individual bug reports
- `groups` — grouped similar reports (assigned by processor)
- `task_log` — records of reports sent to autoproducer
