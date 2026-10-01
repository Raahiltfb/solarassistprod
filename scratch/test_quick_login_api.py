import requests
import json

def test_quick_login():
    print("=== TESTING INSTANT PASSWORDLESS QUICK LOGIN API ===")
    
    url = "http://localhost:3000/api/auth/quick-login"
    
    test_emails = [
        "admin@solarassist.dev",
        "tech1@solarassist.dev",
        "client@cilantro.com",
        "super@solarassist.dev",
        "client@alcove.com"
    ]
    
    for email in test_emails:
        res = requests.post(url, json={"email": email})
        print(f"\n--- Testing email: {email} ---")
        print(f"Status Code: {res.status_code}")
        if res.status_code == 200:
            data = res.json()
            print(f"  ✓ Success: {data.get('success')}")
            print(f"  ✓ Role: {data.get('role')}")
            print(f"  ✓ Redirect URL: {data.get('redirectUrl')}")
            print(f"  ✓ Set-Cookie Headers Present: {'Set-Cookie' in res.headers or 'set-cookie' in res.headers}")
        else:
            print(f"  ❌ Failed: {res.text}")

if __name__ == "__main__":
    test_quick_login()
