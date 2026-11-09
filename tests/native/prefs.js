// SPDX-FileCopyrightText: 2026 Eidrien
// SPDX-License-Identifier: MIT
// Run in an isolated XDG/D-Bus session with xvfb-run gjs -m.
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
Gio.resources_register(Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource'));
const path = GLib.getenv('QS_SOURCE');
const {default: Preferences} = await import(`file://${path}/prefs.js`);
Adw.init();
const window = new Adw.PreferencesWindow();
const metadata = {uuid:'quick-settings-scroll@diskmth.fr', name:'Quick Settings Scroll Adaptive',
    path, 'settings-schema':'org.gnome.shell.extensions.quick-settings-scroll-adaptive'};
const prefs = new Preferences({...metadata, metadata, dir: Gio.File.new_for_path(path)});
prefs.fillPreferencesWindow(window);
const find = widget => {
    if (widget instanceof Adw.SwitchRow) return widget;
    for (let child = widget.get_first_child(); child; child = child.get_next_sibling()) {
        const row = find(child); if (row) return row;
    }
    return null;
};
const row = find(window);
if (!row) throw Error('Missing scrollbar preference');
row.active = true;
if (!prefs.getSettings().get_boolean('show-scrollbars')) throw Error('Preference did not update settings');
row.active = false;
if (prefs.getSettings().get_boolean('show-scrollbars')) throw Error('Preference did not clear settings');
window.destroy();
print('Native Adwaita Show scrollbars preference and GSettings binding passed');
