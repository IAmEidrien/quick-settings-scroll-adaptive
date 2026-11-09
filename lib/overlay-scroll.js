// SPDX-FileCopyrightText: 2026 Eidrien
// SPDX-License-Identifier: MIT
// Floating submenus keep their own actor, box, constraints and animation target.
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import {RoundedClip} from './rounded-clip.js';

// QuickToggleMenu and QST both use the minimum preferred height as their opening
// animation target. EXTERNAL alone reports zero; return the capped natural size
// for both requests instead, without making the contents themselves shorter.
const OverlayScrollView = GObject.registerClass(
class OverlayScrollView extends St.ScrollView {
    setLimit(height) {
        if (!Number.isFinite(height) || this._limit === height)
            return;
        this._limit = height;
        this.queue_relayout();
    }

    vfunc_get_preferred_height(width) {
        const [, natural] = super.vfunc_get_preferred_height(width);
        const height = Math.min(natural, this._limit ?? natural);
        return [height, height];
    }
});

// Change one inline property without erasing someone else's style, including
// styles installed while our patch is active.
export class HeightLimit {
    constructor(actor) {
        this.actor = actor;
        this.base = actor.style;
        this.suffix = '';
        this.written = actor.style;
    }

    set(logicalHeight) {
        if (this.actor.style !== this.written)
            this.base = this.suffix ? this.actor.style?.replace(this.suffix, '') : this.actor.style;
        this.suffix = `\n/* qs-scroll height */ max-height: ${logicalHeight}px;`;
        const next = (this.base ?? '') + this.suffix;
        if (next !== this.actor.style)
            this.actor.style = next;
        this.written = next;
    }

    restore() {
        if (this.actor.style === this.written)
            this.actor.style = this.base;
        else if (this.suffix && this.actor.style?.includes(this.suffix))
            this.actor.style = this.actor.style.replace(this.suffix, '');
    }
}

export class OverlayScroll {
    constructor(actor) {
        this.actor = actor;
        this.menu = actor._delegate;
        this.box = this.menu.box;
        this.index = actor.get_children().indexOf(this.box);
        this.style = new HeightLimit(actor);
        this.baseTranslation = actor.translation_y;
        this.lastTranslation = actor.translation_y;
        this.view = new OverlayScrollView({
            style_class: 'qs-scroll-view',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.EXTERNAL,
            x_expand: true,
            overlay_scrollbars: true,
        });
        this.clip = new RoundedClip(this.box);
        this.view.add_effect_with_name('qs-scroll-rounded-clip', this.clip);
        this.viewport = new St.Viewport({
            x_expand: true, layout_manager: new Clutter.BinLayout(),
        });
        actor.remove_child(this.box);
        this.viewport.add_child(this.box);
        this.view.child = this.viewport;
        actor.insert_child_at_index(this.view, this.index);
    }

    clamp(availableHeight, scale) {
        if (!Number.isFinite(availableHeight) || availableHeight <= 0)
            return;
        const [, chrome] = this.actor.get_theme_node().adjust_preferred_height(0, 0);
        this.view.setLimit(Math.max(1, availableHeight - chrome));
        this.style.set(Math.floor(availableHeight / scale));
    }

    position(area, margin) {
        if (!this.actor.visible || !this.actor.has_allocation())
            return;
        const current = this.actor.translation_y;
        if (current !== this.lastTranslation)
            this.baseTranslation = current;
        const [, actualY] = this.actor.get_transformed_position();
        const [, height] = this.actor.get_transformed_size();
        if (![actualY, height, current].every(Number.isFinite))
            return;
        const y = actualY - (current - this.baseTranslation);
        const top = area.y + margin;
        const bottom = area.y + area.height - margin;
        const wanted = Math.max(top, Math.min(y, bottom - height));
        const translation = this.baseTranslation + wanted - y;
        if (Math.abs(translation - current) > 0.1)
            this.actor.translation_y = translation;
        this.lastTranslation = this.actor.translation_y;
    }

    destroy(actorDestroyed = false) {
        if (this.destroyed)
            return;
        this.destroyed = true;
        if (!actorDestroyed) {
            this.style.restore();
            if (this.actor.translation_y === this.lastTranslation)
                this.actor.translation_y = this.baseTranslation;
            if (this.box.get_parent() === this.viewport)
                this.viewport.remove_child(this.box);
            if (this.view.get_parent())
                this.view.get_parent().remove_child(this.view);
            // Only the view/viewport are ours; never destroy the shell's box.
            if (!this.box.get_parent())
                this.actor.insert_child_at_index(this.box, this.index);
            this.view.destroy();
        }
        // Drop the original box reference even while recursive actor destruction
        // is still in progress; no effect can retain a disposed shell actor.
        this.clip.box = null;
        this.clip = null;
        this.actor = this.box = this.menu = this.view = this.viewport = this.style = null;
    }
}

export function canScroll(adjustment, delta) {
    const max = Math.max(adjustment.lower, adjustment.upper - adjustment.page_size);
    return delta < 0 ? adjustment.value > adjustment.lower :
        delta > 0 && adjustment.value < max;
}

export function scrollDelta(event) {
    switch (event.get_scroll_direction()) {
    case Clutter.ScrollDirection.SMOOTH: return event.get_scroll_delta()[1];
    case Clutter.ScrollDirection.UP: return -1;
    case Clutter.ScrollDirection.DOWN: return 1;
    default: return 0;
    }
}
