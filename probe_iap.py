import sys
import os
import unittest
from unittest.mock import MagicMock
sys.path.append(os.path.join(os.getcwd(), 'server'))

try:
    import app as app_module
    import iap_routes
    from iap_cache import (
        get_cached_public_iap_packages, 
        invalidate_public_iap_packages_cache
    )
    from iap_store import delete_iap_package, IapPackageNotFoundError
except ImportError as e:
    print(f"ImportError: {e}")
    sys.exit(1)

# Monkeypatch require_admin_access
# iap_routes.require_admin_access returns (_claims, auth_error)
# If auth_error is None, access is granted.
iap_routes.require_admin_access = lambda: ({"admin": True}, None)

app = app_module.app
client = app.test_client()

TEST_ID = 'probe-iap-pack-001'

def run_probe():
    print("Checkpoint: Starting probe")
    
    # Cleanup leftover
    try:
        delete_iap_package(TEST_ID)
        print("Checkpoint: Cleaned up leftover package")
    except (IapPackageNotFoundError, Exception):
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
    data = resp.get_json()
    assert resp.status_code in [200, 201], f"POST failed: {resp.status_code} - {resp.get_data(as_text=True)}"
    print("Checkpoint: Package created")

    # GET admin packages
    resp = client.get('/api/admin/iap/packages')
    admin_data = resp.get_json()
    # iap_routes returns {'packages': [...]}
    packages = admin_data.get('packages', [])
    assert any(p['id'] == TEST_ID for p in packages), f"Package {TEST_ID} not in admin list: {admin_data}"
    print("Checkpoint: Verified in admin list")

    # GET public packages
    resp = client.get('/api/iap/packages')
    public_data = resp.get_json()
    packages = public_data.get('packages', [])
    assert any(p['id'] == TEST_ID for p in packages), f"Package {TEST_ID} not in public list: {public_data}"
    print("Checkpoint: Verified in public list")

    # Check cached function
    cached = get_cached_public_iap_packages()
    assert cached is not None and any(p['id'] == TEST_ID for p in cached), "Package not in cached public packages"
    print("Checkpoint: Verified in cached function")

    # PATCH package (deactivate and change price)
    patch_payload = {'isActive': False, 'price': 149000}
    resp = client.patch(f'/api/admin/iap/packages/{TEST_ID}', json=patch_payload)
    assert resp.status_code == 200, f"PATCH failed: {resp.status_code}"
    print("Checkpoint: Package patched (deactivated)")

    # GET public packages again (should be gone from public list)
    resp = client.get('/api/iap/packages')
    public_data = resp.get_json()
    packages = public_data.get('packages', [])
    assert not any(p['id'] == TEST_ID for p in packages), "Inactive package still in public list"
    print("Checkpoint: Verified removed from public list")

    # DELETE package
    resp = client.delete(f'/api/admin/iap/packages/{TEST_ID}')
    assert resp.status_code == 200, f"DELETE failed: {resp.status_code}"
    print("Checkpoint: Package deleted")

    invalidate_public_iap_packages_cache()
    print("Checkpoint: Cache invalidated final")

    print("Probe Result: PASS")

if __name__ == "__main__":
    try:
        run_probe()
    except Exception as e:
        print(f"Probe Result: FAIL - {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
