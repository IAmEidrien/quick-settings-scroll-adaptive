# SPDX-FileCopyrightText: 2026 Eidrien
# SPDX-License-Identifier: MIT
"""Private nested GNOME test; never reads or writes personal settings."""
import argparse
import json
import os
import re
from pathlib import Path
import shutil
import signal
import subprocess
import time

p = argparse.ArgumentParser()
p.add_argument('--output', type=Path, required=True)
p.add_argument('--qst', type=Path, help='compiled upstream QST extension directory')
p.add_argument('--scale', type=int, choices=[1, 2], default=2)
p.add_argument('--shell-version', default='46')
p.add_argument('--baseline', action='store_true')
p.add_argument('--ordinary-only', action='store_true', help='run without enabling Tweaks')
p.add_argument('--qst-only', action='store_true', help='control run without Scroll')
p.add_argument('--multi-monitor', action='store_true')
p.add_argument('--size', default='1280x800')
a = p.parse_args()
if not a.qst and not a.ordinary_only:
    p.error('--qst is required unless --ordinary-only is selected')
source = Path(__file__).resolve().parents[2]
root = a.output.resolve()
if root.is_relative_to(source):
    p.error('--output must be outside the source repository')
root.mkdir(parents=True, exist_ok=False)
for name in ['config', 'data', 'cache', 'runtime']:
    (root / name).mkdir(mode=0o700)
extensions = root / 'data/gnome-shell/extensions'
extensions.mkdir(parents=True)
shutil.copytree(source, extensions / 'quick-settings-scroll@diskmth.fr',
                ignore=shutil.ignore_patterns('.git', 'node_modules', 'build', 'dist', '*.zip', '__pycache__'))
if a.qst:
    shutil.copytree(a.qst, extensions / 'quick-settings-tweaks@qwreey')
    subprocess.run(['glib-compile-schemas', '--strict', str(extensions/'quick-settings-tweaks@qwreey/schemas')], check=True)
probe = extensions/'qs-scroll-probe@eidrien.local'
probe.mkdir()
(probe/'metadata.json').write_text(json.dumps({'uuid': probe.name, 'name': 'Quick Settings regression',
    'description': 'Private integration probe', 'shell-version': [a.shell_version]}))
shutil.copy(source/'tests/native/probe.js', probe/'extension.js')
flags = '--nested --wayland --no-x11 --sm-disable --force-animations'
if a.multi_monitor or int(a.shell_version) >= 50:
    flags = f'--headless --virtual-monitor={a.size} --no-x11 --force-animations'
    if a.multi_monitor:
        flags += ' --virtual-monitor=1024x768'
env = dict(os.environ, REVIEW_ORDINARY_ONLY=str(int(a.ordinary_only)), REVIEW_QST_ONLY=str(int(a.qst_only)), REVIEW_ROOT=str(root), REVIEW_SCALE=str(a.scale), REVIEW_BASELINE=str(int(a.baseline)),
    LIBGL_ALWAYS_SOFTWARE='1', GALLIUM_DRIVER='llvmpipe', XDG_CONFIG_HOME=str(root/'config'),
    XDG_DATA_HOME=str(root/'data'), XDG_CACHE_HOME=str(root/'cache'), XDG_RUNTIME_DIR=str(root/'runtime'),
    XDG_SESSION_TYPE='wayland', XDG_CURRENT_DESKTOP='GNOME', GSETTINGS_BACKEND='dconf', GTK_A11Y='none',
    DBUS_SYSTEM_BUS_ADDRESS=f'unix:path={root}/runtime/system-bus')
(root/'session.sh').write_text('''set -eu
gsettings set org.gnome.shell enabled-extensions '["qs-scroll-probe@eidrien.local"]'
gsettings set org.gnome.shell disabled-extensions '[]'
gsettings set org.gnome.desktop.notifications show-banners false
gsettings set org.gnome.shell welcome-dialog-last-shown-version '46'
exec gnome-shell ''' + flags + '\n')
script = '''set -eu
dbus-daemon --session --address="$DBUS_SYSTEM_BUS_ADDRESS" --nofork > "$REVIEW_ROOT/system-bus.log" 2>&1 &
trap 'kill $! 2>/dev/null || true' EXIT
dbus-run-session -- xvfb-run -a -s '-screen 0 1280x800x24 +extension GLX' bash "$REVIEW_ROOT/session.sh"
'''
with (root/'shell.log').open('w') as log:
    process = subprocess.Popen(['bash', '-c', script], env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    try:
        for _ in range(160):
            if (root/'result.json').exists():
                result = json.loads((root/'result.json').read_text())
                print(json.dumps(result), flush=True)
                if not result.get('pass'):
                    raise RuntimeError(result)
                break
            if process.poll() is not None:
                raise RuntimeError(f'Shell exited {process.returncode}')
            time.sleep(1)
        else:
            raise TimeoutError(str(root))
    finally:
        try:
            os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=5)
        except ProcessLookupError:
            pass
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()

# Fail on extension errors even if the probe managed to finish its assertions.
log_text = (root/'shell.log').read_text()
if re.search(r'JS ERROR|Extension quick-settings-scroll.*(?:Error|Exception)|\bnan\b|Ignoring length', log_text, re.I):
    raise RuntimeError('Shell reported a JavaScript or invalid geometry error; inspect shell.log')
known = 0
for section in log_text.split('\n\n'):
    if 'has been already disposed' not in section:
        continue
    if 'quick-settings-tweaks@qwreey/libs/shared/maid.js' not in section or 'quick-settings-scroll@diskmth.fr/lib/' in section:
        raise RuntimeError('Unexpected disposed actor warning; inspect shell.log')
    known += 1
criticals = [line for line in log_text.splitlines() if 'GLib-GObject-CRITICAL' in line]
if len(criticals) > known or any('has no handler with id' not in line for line in criticals):
    raise RuntimeError('Unexpected GObject critical; inspect shell.log')
if known:
    print(f'Known upstream QST destruction warning: {known}; reproduced with --qst-only', flush=True)
