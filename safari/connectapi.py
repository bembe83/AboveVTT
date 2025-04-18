#remember: pip install pyjwt cryptography requests
import jwt
import time
import requests
import os
import sys
import base64
import subprocess
import pprint

env = dict([a.split("=",1) for a in open('env').read().strip().split('\n')])

def generate_token():
    private_key = base64.b64decode(os.environ.get('PRIVATE_KEY_BASE64')).decode('utf-8')
    payload = {
        "iss": env['APP_STORE_CONNECT_API_ISSUER_ID'],
        "iat": int(time.time()) - 20,  # Issued at
        "exp": int(time.time()) + 19*60,  # 19 min max
        "aud": "appstoreconnect-v1",
    }
    headers = {
        "alg": "ES256",
        "kid": env['APP_STORE_CONNECT_API_KEY_ID']
    }
    token = jwt.encode(payload, private_key, algorithm="ES256", headers=headers)
    return token

# Fetch latest TestFlight version
def fetch_latest_testflight_version(token, app_id):
    url = f"https://api.appstoreconnect.apple.com/v1/builds?filter[app]={app_id}&sort=-version"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }

    response = requests.get(url, headers=headers)

    if response.status_code == 200:
        builds = response.json().get("data", [])
        if builds:
            latest_build = builds[0]  # First item is the latest version
            version = latest_build["attributes"]["version"]
            return int(version)
    else:
        raise Exception(f"Error fetching data: {response.status_code} - {response.text}")

def get_build_id(token, app_id, platform): # IOS/MAC_OS
    url = f"https://api.appstoreconnect.apple.com/v1/builds?filter[app]={app_id}&filter[preReleaseVersion.platform]={platform}&sort=-uploadedDate&limit=1"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        ret = response.json().get('data')[0]
        # pprint.pprint(ret)
        ret = ret.get('id'), ret.get('attributes').get('processingState')
        return ret
    else:
        raise Exception(f"Error fetching data: {response.status_code} - {response.text}")

def get_beta_groups(token, app_id):
    url = f"https://api.appstoreconnect.apple.com/v1/betaGroups?filter[app]={app_id}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        ret = [x.get('id') for x in response.json().get('data') if not x.get('attributes').get('isInternalGroup')]
        # pprint.pprint(ret)
        return ret
    else:
        raise Exception(f"Error fetching data: {response.status_code} - {response.text}")

def find_app(token, bundle):
    url = f"https://api.appstoreconnect.apple.com/v1/apps?filter[bundleId]={bundle}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        apps = response.json().get("data", [])
        if apps:
            return apps[0]['id']
        raise Exception("No app found")
    else:
        raise Exception(f"Error fetching data: {response.status_code} - {response.text}")

def add_to_beta_group(token, group, build):
    url = f"https://api.appstoreconnect.apple.com/v1/betaGroups/{group}/relationships/builds"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }
    body = {
        "data": [
            {
                "type": "builds",
                "id": build
            }
        ]
    }    
    response = requests.post(url, headers=headers, json=body)
    if response.status_code in (200, 204):
        return True
    else:
        raise Exception(f"Error fetching data: {response.status_code} - {response.text}")
    
# Run the script
if __name__ == "__main__":
    token = generate_token()
    app_id = find_app(token, env["BUNDLE_ID"])
    current_version = fetch_latest_testflight_version(token,app_id)
    if sys.argv[1] == 'nextversion':
        #NOTE: if this does not work - we will need to move to VERSION in the Config.xcconfig file instead
        result = subprocess.run(["agvtool", "new-version", "-all", str(current_version + 1)], capture_output=True, text=True)
        print(result.stdout)
    elif sys.argv[1] == 'releasetotest':
        beta_groups = get_beta_groups(token, app_id)
        while 1:
            ios_build_id, valid = get_build_id(token, app_id, 'IOS')
            if valid != "VALID":
                print("Waiting for IOS valid")
                time.sleep(10)
                continue
            mac_build_id, valid = get_build_id(token, app_id, 'MAC_OS')
            if valid != "VALID":
                print("Waiting for MAC valid")                
                time.sleep(10)
                continue            
            break
        for grp in beta_groups:
            print(f"Adding {ios_build_id} to {grp}")
            add_to_beta_group(token, grp, ios_build_id)
            print(f"Adding {mac_build_id} to {grp}")
            add_to_beta_group(token, grp, mac_build_id)
    else:
        raise Exception("no command")    

