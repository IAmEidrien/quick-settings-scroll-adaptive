// SPDX-FileCopyrightText: 2026 Eidrien
// SPDX-License-Identifier: MIT
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
const wait = ms => new Promise(resolve => GLib.timeout_add(0, ms, () => {resolve(); return false;}));
const root = GLib.getenv('REVIEW_ROOT');
const scrollId = 'quick-settings-scroll@diskmth.fr', tweaksId = 'quick-settings-tweaks@qwreey';
export default class Probe extends Extension {
    enable() {
        GLib.timeout_add(0, 3000, () => {
            this.run().catch(error => GLib.file_set_contents(`${root}/result.json`, JSON.stringify({error: String(error), stack: error.stack})));
            return false;
        });
    }
    disable() {}
    async run() {
        const checks = [];
        const check = (ok, label) => {
            if (!ok) throw Error(label);
            checks.push(label); print(label);
            GLib.file_set_contents(`${root}/progress.json`, JSON.stringify(checks));
        };
        const enable = async id => {
            Main.extensionManager.enableExtension(id); await wait(350);
            check(Main.extensionManager.lookup(id).state === 1, `enabled ${id}`);
        };
        const disable = async id => { Main.extensionManager.disableExtension(id); await wait(350); };
        const pointer = (Clutter.get_default_backend?.() ?? global.stage.get_context().get_backend()).get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        const move = async (x, y) => {
            pointer.notify_absolute_motion(GLib.get_monotonic_time(), x, y); await wait(100);
            // A newly attached virtual device can be initialized by its first
            // motion on newer headless Mutter. Verify positioning with a repeat.
            pointer.notify_absolute_motion(GLib.get_monotonic_time(), x, y); await wait(100);
        };
        const wheel = async () => {
            pointer.notify_discrete_scroll(GLib.get_monotonic_time(), Clutter.ScrollDirection.DOWN, Clutter.ScrollSource.WHEEL);
            await wait(350);
        };
        const shot = async name => {
            const stream = Gio.File.new_for_path(`${root}/${name}.png`).replace(null, false, Gio.FileCreateFlags.NONE, null);
            await new Shell.Screenshot().screenshot(false, stream); stream.close(null);
        };
        Main.overview.hide();
        const uiScale = Number(GLib.getenv('REVIEW_SCALE'));
        St.ThemeContext.get_for_stage(global.stage).scale_factor = uiScale;
        const clutterSettings = Clutter.Settings.get_default?.() ?? global.stage.get_context().get_settings();
        clutterSettings.font_dpi = 96 * 1024 * uiScale;
        await wait(300);
        const menu = Main.panel.statusArea.quickSettings.menu;
        const grid = menu._grid, overlay = menu._overlay;
        const originalStyle = menu._boxPointer.style;
        const control = GLib.getenv('REVIEW_QST_ONLY') === '1';
        if (!control) await enable(scrollId);
        const patch = () => Main.extensionManager.lookup(scrollId).stateObj?._patch;
        const toggle = new QuickSettings.QuickMenuToggle({title: 'Independent scrolling', icon_name: 'preferences-system-symbolic'});
        toggle.menu.setHeader('preferences-system-symbolic', 'Tall overlay');
        const rows = [];
        for (let i = 0; i < 30; i++) {
            const row = new PopupMenu.PopupMenuItem(`Overlay row ${i}`);
            rows.push(row); toggle.menu.addMenuItem(row);
        }
        menu.addItem(toggle, 2);
        const originalBox = toggle.menu.box;
        const originalSubmenuStyle = toggle.menu.actor.style;
        const extras = [];
        for (let i = 0; i < 20; i++) {
            const item = new QuickSettings.QuickToggle({title: `Extra ${i}`, icon_name: 'preferences-system-symbolic'});
            menu.addItem(item); extras.push(item);
        }
        if (GLib.getenv('REVIEW_ORDINARY_ONLY') === '1') {
            menu.open(); await wait(450);
            const view = patch()._scrollView, adj = view.vadjustment;
            const [mx,my] = menu._boxPointer.get_transformed_position();
            const [mw,mh] = menu._boxPointer.get_transformed_size();
            const area = patch()._workArea();
            check(mh <= area.height, 'ordinary menu fits work area');
            await move(mx+mw/2,my+mh/2); await wheel();
            print(`ORDINARY ${JSON.stringify({adj:{value:adj.value,upper:adj.upper,page:adj.page_size},pointer:global.get_pointer(),bounds:[mx,my,mw,mh],open:menu.isOpen,mapped:view.mapped})}`);
            check(adj.value > 0, 'ordinary quick toggles accept real wheel input');
            adj.value = 0;
            toggle.menu.open(); await wait(500);
            rows.at(-1).actor.grab_key_focus(); await wait(300);
            const [, fy] = rows.at(-1).actor.get_transformed_position();
            const [, vy] = view.get_transformed_position();
            check(fy >= vy-1 && fy+rows.at(-1).actor.height <= vy+view.height+1, 'inline submenu keyboard focus remains reachable');
            await shot('ordinary-inline');
            toggle.menu.close(); menu.close(); await wait(500);
            await disable(scrollId);
            check(grid.get_parent() === menu.box && menu._boxPointer.style === originalStyle, 'ordinary teardown restores menu');
            toggle.menu.destroy(); toggle.destroy(); extras.forEach(item=>item.destroy());
            GLib.file_set_contents(`${root}/result.json`, JSON.stringify({pass:true,checks}));
            return;
        }
        const qst = Main.extensionManager.lookup(tweaksId);
        const schema = Gio.SettingsSchemaSource.new_from_directory(`${qst.path}/schemas`, Gio.SettingsSchemaSource.get_default(), false);
        const settings = new Gio.Settings({settings_schema: schema.lookup('org.gnome.shell.extensions.quick-settings-tweaks', true)});
        for (const key of settings.settings_schema.list_keys()) {
            if (key.endsWith('-enabled') && settings.get_value(key).get_type_string() === 'b') settings.set_boolean(key, false);
        }
        settings.set_boolean('overlay-menu-enabled', true);
        settings.set_int('overlay-menu-animate-duration', 200);
        await enable(tweaksId);
        menu.open(); await wait(400);
        toggle.menu.open(); await wait(650);
        const actor = toggle.menu.actor;
        const [x, y] = actor.get_transformed_position(), [w, h] = actor.get_transformed_size();
        print(`MEASURE ${JSON.stringify({x,y,w,h,main:menu._boxPointer.get_transformed_size()})}`);
        if (!control) print(`THEME ${JSON.stringify({box:originalBox.get_size(),position:originalBox.get_position(),scale:[originalBox.scale_x,originalBox.scale_y],margin:[St.Side.LEFT,St.Side.TOP,St.Side.RIGHT,St.Side.BOTTOM].map(s=>originalBox.get_theme_node().get_margin(s)),radius:[St.Corner.TOPLEFT,St.Corner.TOPRIGHT,St.Corner.BOTTOMRIGHT,St.Corner.BOTTOMLEFT].map(c=>originalBox.get_theme_node().get_border_radius(c)), view:patch()._submenus.get(actor)?.patch?.view.get_size()})}`);
        await shot('overlay');
        if (control || GLib.getenv('REVIEW_BASELINE') === '1') {
            toggle.menu.close(); await wait(450);
            toggle.menu.destroy(); toggle.destroy(); await wait(200);
            await disable(tweaksId);
            GLib.file_set_contents(`${root}/result.json`, JSON.stringify({pass:true,checks,measurement:{x,y,w,h}}));
            return;
        }
        const boundsCheck = label => {
            const area = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.findIndexForActor(menu.sourceActor));
            const [, ay] = actor.get_transformed_position(), [, ah] = actor.get_transformed_size();
            check(Number.isFinite(ay+ah) && ay >= area.y && ay+ah <= area.y+area.height, label);
        };
        boundsCheck('overlay constrained to monitor work area');
        check(menu._grid === grid && menu._overlay === overlay && toggle.menu.box === originalBox, 'shell and QST actor identities preserved');
        const record = patch()._submenus.get(actor);
        check(record.patch && record.patch.view.vadjustment.upper > record.patch.view.vadjustment.page_size, 'tall overlay has independent scroll range');
        const base = patch()._scrollView.vadjustment, adj = record.patch.view.vadjustment;
        base.value = 80; await wait(100);
        const baseBefore = base.value;
        adj.value = 0;
        await move(x+w/2, y+h/2); await wheel();
        check(adj.value > 0 && base.value === baseBefore, 'real wheel scrolls overlay without moving base menu');
        const overlayBefore = adj.value;
        const [bx, by] = menu._boxPointer.get_transformed_position();
        await move(bx+12, by+100); await wheel();
        print(`BACKGROUND ${JSON.stringify({baseBefore,baseAfter:base.value,overlayBefore,overlayAfter:adj.value,box:[bx,by],overlay:[x,y,w,h],active:!!patch()._activeOverlay()})}`);
        check(base.value === baseBefore, 'wheel on dimmed menu cannot move base scroll region');
        rows.at(-1).actor.grab_key_focus(); await wait(300);
        const [, ry] = rows.at(-1).actor.get_transformed_position();
        const [, vy] = record.patch.view.get_transformed_position();
        check(ry >= vy-1 && ry+rows.at(-1).actor.height <= vy+record.patch.view.height+1, 'keyboard focus reveals final overlay control');
        await shot('overlay-bottom');
        const saved = adj.value;
        toggle.menu.close(); await wait(500);
        check(base.value === baseBefore, 'closing overlay preserves base scroll position');
        toggle.menu.open(); await wait(650);
        check(Math.abs(adj.value-saved)<1, 'reopening overlay preserves its scroll position');
        const extraRow = new PopupMenu.PopupMenuItem('Added while open');
        toggle.menu.addMenuItem(extraRow); await wait(200);
        check(toggle.menu._getMenuItems().includes(extraRow), 'original menu item API works after dynamic insertion');
        extraRow.actor.grab_key_focus(); await wait(300); boundsCheck('dynamic overlay content remains constrained');
        extraRow.destroy();
        for (const row of rows.slice(2)) row.actor.hide();
        global.stage.set_key_focus(null); await wait(350);
        check(actor.height < h && adj.upper <= adj.page_size+1, 'shortened overlay shrinks naturally without stale scroll range');
        await shot('overlay-short');
        toggle.menu.close(); await wait(450);
        settings.set_boolean('overlay-menu-enabled', false); await wait(450);
        check(!patch()._floating && originalBox.get_parent() === actor && actor.style === originalSubmenuStyle, 'overlay mode off restores original submenu hierarchy and styles');
        for (const row of rows) row.actor.show();
        toggle.menu.open(); await wait(500);
        check(patch()._scrollView.vadjustment.upper > patch()._scrollView.vadjustment.page_size, 'inline submenu uses ordinary menu scrolling');
        rows.at(-1).actor.grab_key_focus(); await wait(300);
        const [, inlineY] = rows.at(-1).actor.get_transformed_position();
        const inlineView = patch()._scrollView;
        const [, inlineTop] = inlineView.get_transformed_position();
        check(inlineY >= inlineTop-1 && inlineY+rows.at(-1).actor.height <= inlineTop+inlineView.height+1, 'inline submenu keyboard focus reveals final control');
        toggle.menu.close(); menu.close(); await wait(500);
        await disable(tweaksId);
        menu.open(); await wait(350);
        const ordinary = patch()._scrollView.vadjustment;
        ordinary.value = 0;
        const [mx,my] = menu._boxPointer.get_transformed_position();
        const [mw,mh] = menu._boxPointer.get_transformed_size();
        await move(mx+mw/2, my+mh/2); await wheel();
        check(ordinary.value > 0, 'Scroll alone: real wheel works over ordinary quick toggles');
        const slider = new QuickSettings.QuickSlider({icon_name: 'audio-volume-high-symbolic'});
        slider.slider.value = 0.5;
        menu.insertItemBefore(slider, menu.getFirstItem(), 2);
        ordinary.value = 0; await wait(250);
        const [sx,sy] = slider.slider.get_transformed_position();
        const [sw,sh] = slider.slider.get_transformed_size();
        const sliderBefore = slider.slider.value;
        await move(sx+sw/2,sy+sh/2); await wheel();
        check(slider.slider.value !== sliderBefore && ordinary.value === 0, 'slider keeps wheel input without scrolling menu');
        slider.menu.destroy(); slider.destroy();
        menu.close(); await wait(450);
        settings.set_boolean('overlay-menu-enabled', true);
        await disable(scrollId);
        check(grid.get_parent() === menu.box && menu._boxPointer.style === originalStyle, 'disable restores grid and original inline style');
        await enable(tweaksId); await enable(scrollId);
        menu.open(); await wait(350); toggle.menu.open(); await wait(600);
        boundsCheck('Tweaks-first enable order supports constrained overlay');
        await disable(scrollId);
        check(originalBox.get_parent() === actor && grid.get_parent() === menu.box, 'Scroll-first disable restores actors while QST overlay is open');
        toggle.menu.close(); menu.close(); await wait(500);
        await enable(scrollId);
        await disable(tweaksId);
        check(originalBox.get_parent() === actor && !patch()._floating, 'Tweaks-first disable restores inline scrolling');
        await enable(tweaksId);
        for (let i=0;i<3;i++) {
            menu.open(); toggle.menu.open(); await wait(50);
            toggle.menu.close(); menu.close(); await wait(60);
        }
        await wait(600);
        const transient = new QuickSettings.QuickMenuToggle({title: 'Dynamic lifecycle'});
        menu.addItem(transient);
        await wait(100);
        const transientActor = transient.menu.actor;
        check(patch()._submenus.has(transientActor), 'dynamic overlay actor tracked');
        transient.menu.destroy(); transient.destroy(); await wait(200);
        check(!patch()._submenus.has(transientActor), 'destroyed overlay actor and callbacks removed');
        if (Main.layoutManager.monitors.length > 1) {
            const secondary = Main.layoutManager.monitors[1];
            const source = new St.Widget({reactive: true, width: 40, height: 32,
                x: secondary.x+secondary.width-60, y: secondary.y});
            Main.uiGroup.add_child(source);
            const originalSource = menu.sourceActor;
            menu.sourceActor = source;
            menu.open(); await wait(400); toggle.menu.open(); await wait(600);
            check(Main.layoutManager.findIndexForActor(source) === 1, 'test source is on secondary monitor');
            boundsCheck('overlay follows secondary monitor work area');
            const workArea = Main.layoutManager.getWorkAreaForMonitor(1);
            check(patch()._workArea().height === workArea.height, 'height limit uses source monitor rather than primary');
            toggle.menu.close(); menu.close(); await wait(500);
            menu.sourceActor = originalSource;
            source.destroy();
        }
        await disable(tweaksId);
        toggle.menu.destroy(); toggle.destroy(); for (const item of extras) item.destroy();
        await disable(scrollId);
        check(grid.get_parent() === menu.box && originalStyle === menu._boxPointer.style, 'repeated transitions leave original menu intact');
        // Rebuild the actual Shell menu in isolation, leaving the panel's original
        // menu available for restoration. Destroy while Scroll is still enabled.
        const rebuilt = new QuickSettings.QuickSettingsMenu(menu.sourceActor, 2);
        rebuilt.actor.hide();
        Main.uiGroup.add_child(rebuilt.actor);
        Main.panel.statusArea.quickSettings.menu = rebuilt;
        await enable(scrollId);
        const rebuiltPatch = patch();
        check(rebuiltPatch._menu === rebuilt, 'new menu instance receives its own patch');
        await wait(200);
        rebuilt.destroy(); await wait(200);
        check(rebuiltPatch._menu === null && rebuiltPatch._layoutLater === 0, 'menu destruction cancels pending callbacks and releases actors');
        await disable(scrollId);
        Main.panel.statusArea.quickSettings.menu = menu;
        check(grid.get_parent() === menu.box, 'original menu survives reconstruction test');
        GLib.file_set_contents(`${root}/result.json`, JSON.stringify({pass:true,checks,scale:Number(GLib.getenv('REVIEW_SCALE')),monitors:Main.layoutManager.monitors}));
    }
}
