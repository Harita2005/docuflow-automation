#!/usr/bin/env python3
"""
DocuFlow M2M Service Sync Client
Demonstrates Option 1: Direct Service Token generation & document ingestion.
"""
import sys
import requests

BASE_URL = "http://192.168.179.22:3000"
SERVICE_USER = "backend_sync_client"
SERVICE_PASS = "SecretPassword987654321!"


def get_service_token(base_url: str = BASE_URL) -> str:
    endpoints = [
        f"{base_url}/login",
        f"{base_url}/api/sync/login",
        f"{base_url}/m2m/auth/login",
    ]
    last_err = None
    for url in endpoints:
        try:
            resp = requests.post(
                url,
                json={"username": SERVICE_USER, "password": SERVICE_PASS},
                timeout=10,
            )
            if resp.status_code == 200:
                data = resp.json()
                token = data.get("access_token")
                if token:
                    print(f"[*] Successfully obtained Bearer token from {url} (expires in {data.get('expires_in')}s)")
                    return token
        except requests.exceptions.RequestException as err:
            last_err = err
            continue
    raise RuntimeError(f"Failed to obtain token from endpoints {endpoints}: {last_err}")


def post_document(token: str, payload: dict, base_url: str = BASE_URL) -> dict:
    sync_url = f"{base_url}/api/sync/record"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    resp = requests.post(sync_url, json=payload, headers=headers, timeout=15)
    resp.raise_for_status()
    res_data = resp.json()
    print(f"[+] Document created successfully! ID: {res_data.get('document_id')}")
    print(f"    Status: {res_data.get('status')} | Stage: {res_data.get('current_stage')} / {res_data.get('total_stages')}")
    return res_data


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else BASE_URL
    token = get_service_token(url)
    example_payload = {
        "doc_key": "ERP-INV-2026-DEMO-01",
        "doc_num": "INV-DEMO-01",
        "invoice_number": "INV-DEMO-01",
        "invoice_date": "2026-10-21",
        "due_date": "2026-11-20",
        "po_number": "PO-99210",
        "amount": 15000.0,
        "currency": "INR",
        "vendor_name": "Precision Engineering Supplies",
        "vendor_code": "VEND-PREC-01",
        "company_code": "VCC",
        "division": "VCC",
        "plant": "Chennai",
        "document_type": "AP INVOICE",
    }
    post_document(token, example_payload, url)
