# Runtime audit checks

This folder contains generated runtime checks for the Option Risk Calculator merge audit.

Run from the repository root:

```bash
python3 audit_runtime_checks/scripts/generate_test_files.py
python3 audit_runtime_checks/scripts/generate_data_api_completeness_files.py
python3 audit_runtime_checks/scripts/backend_smoke_check.py
python3 audit_runtime_checks/scripts/api_contract_check.py
python3 audit_runtime_checks/scripts/frontend_route_check.py
python3 audit_runtime_checks/scripts/full_user_flow_check.py
python3 audit_runtime_checks/scripts/negative_cases_check.py
python3 audit_runtime_checks/scripts/data_api_completeness_check.py
```

Expected local services:

- Backend: `http://127.0.0.1:8000`
- Frontend: `http://127.0.0.1:5173`

Use `BACKEND_URL` and `FRONTEND_URL` to override these URLs.

Reports are written to `audit_runtime_checks/reports/`.
