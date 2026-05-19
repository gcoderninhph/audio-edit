import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'server'))

from flask import Flask
import unittest
from unittest.mock import patch

try:
    import app as app_module
    from routes import iap_routes
    from services.iap_service import (
        get_cached_public_iap_packages, 
        invalidate_public_iap_packages_cache,
        delete_iap_package,
        IapPackageNotFoundError
    )
except ImportError as e:
    print(f"ImportError: {e}")
    sys.exit(1)

# Monkeypatch require_admin_access
original_require_admin = iap_routes.require_admin_access
iap_routes.require_admin_access = lambda f: f

app = app_module.app
client = app.test_client()

TEST_ID = 'probe-iap-pack-001'

def run_probe():
    print("Checkpoint: Starting probe")
    
    # Cleanup leftover
    try:
        delete_iap_package(TEST_ID)
        print("Checkpoint: Cleaned up leftover package")
    except IapPackageNotFoundError:
        pass
    
    invalidate_public_iap_packages_cache()
    print("Checkpoint: Cache invalidated")

    # POST new package
    payload = {
        'id': TEST_ID,
        'name': 'Probe Package',
        'price': 99000,
        'currency': 'VND',
        'credits': 1000,
        'description': 'Probe package',
        'isActive': True
    }
    resp = client.post('/api/admin/iap/packages', json=payload)
    assert resp.status_code == 201 or resp.status_code == 200, f"POST failed: {resp.status_code}"
    print("Checkpoint: Package created")

    # GET admin packages
    resp = client.get('/api/admin/iap/packages')
    assert any(p['id'] == TEST_ID for p in resp.get_json()), "Package not in admin list"
    print("Checkpoint: Verified in admin list")

    # GET public packages
    resp = client.get('/api/iap/packages')
    assert any(p['id'] == TEST_ID for p in resp.get_json()), "Package not in public list"
    print("Checkpoint: Verified in public list")

    # Check cached function
    cached = get_cached_public_iap_packages()
    assert any(p['id'] == TEST_ID for p in cached), "Package not in cached public packages"
    print("Checkpoint: Verified in cached function")

    # PATCH package (deactivate and change price)
    patch_payload = {'isActive': False, 'price': 149000}
    resp = client.patch(f'/api/admin/iap/packages/{TEST_ID}', json=patch_payload)
    assert resp.status_code == 200, f"PATCH failed: {resp.status_code}"
    print("Checkpoint: Package patched (deactivated)")

    # GET public packages again (should be gone)
    resp = client.get('/api/iap/packages')
    assert not any(p['id'] == TEST_ID for p in resp.get_json()), "Inactive package still in public list"
    print("Checkpoint: Verified removed from public list")

    # DELETE package
    resp = client.delete(f'/api/admin/iap/packages/{TEST_ID}')
    assert resp.status_code == 200, f"DELETE failed: {resp.status_code}"
    print("Checkpoint: Package deleted")

    invalidate_public_iap_packages_cache()
    print("Checkpoint: Cache invalidated final")

    # Restore
    iap_routes.require_admin_access = original_require_admin
    print("Probe Result: PASS")

if __name__ == "__main__":
    try:
        run_probe()
    except Exception as e:
        print(f"Probe Result: FAIL - {e}")
        iap_routes.require_admin_access = original_require_admin
        sys.exit(1)
