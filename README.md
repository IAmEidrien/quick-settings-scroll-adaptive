# Quick Settings Scroll Adaptive

Makes GNOME's Quick Settings menu scroll when it exceeds the available screen height. Floating submenus from [Quick Settings Tweaks](https://github.com/qwreey/quick-settings-tweaks) get independent scrolling, so their controls remain reachable at large UI scales.

This is a fork of [Quick Settings Scroll by Disk_MTH](https://github.com/Disk-MTH/Quick-Settings-Scroll). The focus is compatibility, interoperability and reliable cleanup. There are no additional preferences.

## Behavior

- Ordinary Quick Settings menus retain upstream's scrolling behavior, including when Tweaks is absent or its overlay mode is off.
- Floating overlays fit the menu's monitor work area with an edge margin. Tall overlays scroll separately from the underlying menu; short overlays use their natural height.
- Wheel input over the dimmed background cannot scroll the underlying menu. Sliders and nested scrolling lists retain their own wheel handling.
- Keyboard focus scrolls hidden controls into view. Closing a submenu preserves the underlying menu position and the submenu's position; closing Quick Settings resets scrolling for the next visit.
- Existing theme colors, spacing and corner radii are used. Tweaks keeps its original submenu box and animation target.
- Scale, monitor work-area and content changes recalculate constraints. Disabling restores the original actors and removes owned callbacks and styles.

GNOME Shell **46–51** is declared upstream and retained. See [native validation](docs/VALIDATION.md) for the exact versions and scenarios tested in this fork. A compatibility declaration is not a claim that every version, theme or extension combination has been tested.

## Install the development branch

`testing` contains development changes; `main` is the release branch.

```sh
git clone --branch testing https://github.com/IAmEidrien/quick-settings-scroll-adaptive.git
cd quick-settings-scroll-adaptive
make install
# Restart the session, then:
gnome-extensions enable quick-settings-scroll@diskmth.fr
```

The upstream UUID is deliberately retained for in-place replacement. **Use either upstream or this fork, never two copies at once.** The GNOME Extensions listing for the original extension does not distribute this fork. Automatic updates from that listing may replace a manual installation.

GNOME caches extension modules: after changing installed JavaScript, start a new session to load it. `make pack` creates an installable ZIP. If the installation directory is already a Git checkout, update that checkout directly; `make install` refuses to overwrite it.

## Development

Run `make test` for syntax and ownership/geometry regression checks, and `make pack` to verify packaging. Real GNOME probes use isolated settings and the actual Tweaks extension; instructions and results are in [docs/VALIDATION.md](docs/VALIDATION.md). CI runs the portable checks and packages an artifact; it does not promote `testing` to `main`.

Runtime code is in `lib/quick-settings-scroll.js`, with local floating-overlay support in `lib/overlay-scroll.js` and theme-derived corner clipping in `lib/rounded-clip.js`. No global Shell method is replaced. The implementation uses private Quick Settings actor interfaces, so future Shell changes may require compatibility updates.

## License and attribution

Quick Settings Scroll's original code and modifications to it remain **GPL-2.0-or-later**, with Disk_MTH's notices preserved; see [LICENSE](LICENSE). Independently written overlay helpers and regression tests are **MIT**, as identified by their SPDX headers; see [LICENSES/MIT.txt](LICENSES/MIT.txt). The combined extension is distributed under GPL-2.0-or-later.

Quick Settings Tweaks is a separate project used for interoperability testing. Its code is not bundled or copied into the extension. Development and validation use AI assistance.
