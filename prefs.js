// SPDX-FileCopyrightText: 2026 Eidrien
// SPDX-License-Identifier: MIT
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ScrollPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const page = new Adw.PreferencesPage({title: 'Scrolling', icon_name: 'input-mouse-symbolic'});
        const group = new Adw.PreferencesGroup();
        const row = new Adw.SwitchRow({title: 'Show scrollbars',
            subtitle: 'Show a scrollbar when a menu has more content than fits on screen.'});
        const settings = this.getSettings();
        settings.bind('show-scrollbars', row, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(row); page.add(group); window.add(page);
    }
}
