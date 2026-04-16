#!/usr/bin/env python3
"""
🚀 VinFast Deploy Script
Chạy: python deploy.py
- Tự động build client + upload + restart server
"""
import paramiko
import subprocess
import os
import sys
import time

# ========== CẤU HÌNH ==========
SSH_HOST = "103.216.117.31"
SSH_PORT = 24700
SSH_USER = "root"
SSH_PASS = "ywhUk7I>c+=__nAFso5="
REMOTE_DIR = "/var/www/vinfast"
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
# ===============================

SKIP_DIRS = {'node_modules', '.git', '.vscode', '__pycache__'}

def log(msg):
    print(f"  {'─'*2} {msg}")

def get_ssh():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(SSH_HOST, port=SSH_PORT, username=SSH_USER, password=SSH_PASS, timeout=30)
    client.get_transport().set_keepalive(30)
    return client

def ssh_exec(client, cmd, label=""):
    full_cmd = f'export NVM_DIR=/root/.nvm && source /root/.nvm/nvm.sh && {cmd}'
    stdin, stdout, stderr = client.exec_command(full_cmd, timeout=120)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    code = stdout.channel.recv_exit_status()
    if out and label:
        log(out[:200])
    return out, err, code

def upload_dir(sftp, local_dir, remote_dir):
    """Upload directory recursively, skipping node_modules/.git"""
    count = 0
    for root, dirs, files in os.walk(local_dir):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        rel = os.path.relpath(root, local_dir).replace(os.sep, '/')
        remote_root = remote_dir if rel == '.' else f"{remote_dir}/{rel}"
        
        try:
            sftp.stat(remote_root)
        except FileNotFoundError:
            _mkdir_p(sftp, remote_root)
        
        for f in files:
            sftp.put(os.path.join(root, f), f"{remote_root}/{f}")
            count += 1
    return count

def _mkdir_p(sftp, path):
    parts = path.split('/')
    current = ''
    for part in parts:
        if not part:
            current = '/'
            continue
        current = f"{current}/{part}" if current != '/' else f"/{part}"
        try:
            sftp.stat(current)
        except FileNotFoundError:
            sftp.mkdir(current)

def step_git_pull():
    print("\n📥 [1/5] Git pull code mới nhất từ GitHub...")
    result = subprocess.run(['git', 'pull'], cwd=PROJECT_DIR,
                          capture_output=True, text=True, shell=True)
    if result.returncode != 0:
        print(f"  ❌ Git pull failed: {result.stderr}")
        sys.exit(1)
    output = result.stdout.strip()
    log(output if output else "Already up to date")
    
    if "Already up to date" in output:
        answer = input("  Code chưa thay đổi. Vẫn deploy? (y/n): ").strip().lower()
        if answer != 'y':
            print("  Hủy deploy.")
            sys.exit(0)

def step_build_client():
    print("\n⚡ [2/5] Build client...")
    client_dir = os.path.join(PROJECT_DIR, 'client')
    result = subprocess.run(['npm', 'run', 'build'], cwd=client_dir, 
                          capture_output=True, text=True, shell=True)
    if result.returncode != 0:
        print(f"  ❌ Build failed: {result.stderr}")
        sys.exit(1)
    log("Build thành công ✓")

def step_upload_client():
    print("\n📦 [3/5] Upload client/dist...")
    client = get_ssh()
    sftp = client.open_sftp()
    
    # Clear old dist
    ssh_exec(client, f"rm -rf {REMOTE_DIR}/client/dist")
    
    local_dist = os.path.join(PROJECT_DIR, 'client', 'dist')
    count = upload_dir(sftp, local_dist, f"{REMOTE_DIR}/client/dist")
    log(f"{count} files uploaded ✓")
    
    sftp.close()
    client.close()

def step_upload_server():
    print("\n📦 [4/5] Upload server code...")
    client = get_ssh()
    sftp = client.open_sftp()
    
    # Upload server source files (not node_modules)
    local_server = os.path.join(PROJECT_DIR, 'server')
    
    # Upload src/ directory
    src_dir = os.path.join(local_server, 'src')
    count = upload_dir(sftp, src_dir, f"{REMOTE_DIR}/server/src")
    
    # Upload package.json
    sftp.put(os.path.join(local_server, 'package.json'), f"{REMOTE_DIR}/server/package.json")
    count += 1
    
    log(f"{count} files uploaded ✓")
    
    # Install deps if package.json changed
    log("Checking dependencies...")
    out, err, code = ssh_exec(client, 
        f"source /opt/rh/devtoolset-11/enable 2>/dev/null; cd {REMOTE_DIR}/server && npm install --production 2>&1 | tail -3",
        label="deps")
    
    sftp.close()
    client.close()

def step_restart():
    print("\n🔄 [5/5] Restart server...")
    client = get_ssh()
    ssh_exec(client, "pm2 restart vinfast-api", label="restart")
    time.sleep(2)
    
    # Health check
    out, _, _ = ssh_exec(client, "curl -s https://vf.content360.store/api/health")
    if '"ok"' in out:
        log("Health check passed ✓")
    else:
        log(f"⚠️  Health check: {out}")
    
    client.close()

if __name__ == "__main__":
    print("🚀 Deploying VinFast to vf.content360.store")
    print("=" * 45)
    
    start = time.time()
    
    # Cho phép skip bước nào đó
    skip = sys.argv[1] if len(sys.argv) > 1 else ""
    
    step_git_pull()
    
    if skip != "--server-only":
        step_build_client()
        step_upload_client()
    
    step_upload_server()
    step_restart()
    
    elapsed = round(time.time() - start)
    print(f"\n✅ Deploy xong trong {elapsed}s!")
    print(f"🌐 https://vf.content360.store")
