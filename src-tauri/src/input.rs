use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

#[derive(Default)]
struct Gesture {
    cursor: (f64, f64),
    start: (f64, f64),
    left_down: bool,
    dragging: bool,
    modifiers: [bool; 3],
    wheel_open: bool,
}

#[derive(Clone, Copy)]
enum WheelMode {
    Convert,
    Tools,
    Actions,
}

impl WheelMode {
    fn name(self) -> &'static str {
        match self {
            Self::Convert => "convert",
            Self::Tools => "tools",
            Self::Actions => "actions",
        }
    }
}

enum InputEvent {
    Move(f64, f64),
    LeftDown(f64, f64),
    LeftUp,
    ModifierDown(WheelMode),
    ModifierUp(WheelMode),
    Escape,
}

enum Action {
    Open(WheelMode),
    Switch(WheelMode),
    End,
    Cancel,
}

static APP: OnceLock<AppHandle> = OnceLock::new();
static GESTURE: OnceLock<Mutex<Gesture>> = OnceLock::new();
static MODIFIER_MODES: OnceLock<Mutex<[WheelMode; 3]>> = OnceLock::new();

#[derive(Clone, Copy)]
enum ModifierKey { Shift, Control, Alt }

#[derive(Default)]
struct PhysicalModifiers {
    pressed: [[bool; 2]; 3],
}

impl PhysicalModifiers {
    fn update(&mut self, key: ModifierKey, right: bool, down: bool) -> Option<InputEvent> {
        let index = match key { ModifierKey::Shift => 0, ModifierKey::Control => 1, ModifierKey::Alt => 2 };
        let was_down = self.pressed[index].iter().any(|pressed| *pressed);
        self.pressed[index][usize::from(right)] = down;
        match (was_down, self.pressed[index].iter().any(|pressed| *pressed)) {
            (false, true) => Some(InputEvent::ModifierDown(mode_for_modifier(key))),
            (true, false) => Some(InputEvent::ModifierUp(mode_for_modifier(key))),
            _ => None,
        }
    }
}

pub fn start(app: AppHandle) {
    let _ = APP.set(app);
    let _ = GESTURE.set(Mutex::new(Gesture::default()));
    MODIFIER_MODES.get_or_init(|| Mutex::new([WheelMode::Convert, WheelMode::Tools, WheelMode::Actions]));

    #[cfg(windows)]
    windows::start();
    #[cfg(target_os = "macos")]
    macos::start();
}

pub fn configure_modifiers(convert: &str, tools: &str, actions: &str) -> Result<(), String> {
    let parse = |key| match key {
        "SHIFT" => Some(0), "CTRL" => Some(1), "ALT" => Some(2), _ => None,
    };
    let convert = parse(convert).ok_or("Unsupported format modifier")?;
    let tools = parse(tools).ok_or("Unsupported tools modifier")?;
    let actions = parse(actions).ok_or("Unsupported file action modifier")?;
    if convert == tools || convert == actions || tools == actions {
        return Err("Modifier keys must be unique Shift, Ctrl, or Alt keys".into());
    }
    let mut modes = [WheelMode::Convert; 3];
    modes[convert] = WheelMode::Convert;
    modes[tools] = WheelMode::Tools;
    modes[actions] = WheelMode::Actions;
    let lock = MODIFIER_MODES.get_or_init(|| Mutex::new([WheelMode::Convert, WheelMode::Tools, WheelMode::Actions]));
    *lock.lock().map_err(|_| "Modifier settings are unavailable")? = modes;
    Ok(())
}

fn mode_for_modifier(key: ModifierKey) -> WheelMode {
    let index = match key { ModifierKey::Shift => 0, ModifierKey::Control => 1, ModifierKey::Alt => 2 };
    MODIFIER_MODES.get().and_then(|modes| modes.lock().ok().map(|modes| modes[index])).unwrap_or([WheelMode::Convert, WheelMode::Tools, WheelMode::Actions][index])
}

impl Gesture {
    fn transition(&mut self, event: InputEvent) -> Option<Action> {
        match event {
            InputEvent::Move(x, y) => {
                self.cursor = (x, y);
                if self.left_down
                    && !self.dragging
                    && ((x - self.start.0).abs() >= 8.0 || (y - self.start.1).abs() >= 8.0)
                {
                    self.dragging = true;
                    let mode = [WheelMode::Actions, WheelMode::Tools, WheelMode::Convert]
                        .into_iter()
                        .find(|mode| self.modifiers[*mode as usize]);
                    let Some(mode) = mode else { return None };
                    self.wheel_open = true;
                    return Some(Action::Open(mode));
                }
                None
            }
            InputEvent::LeftDown(x, y) => {
                self.cursor = (x, y);
                self.start = (x, y);
                self.left_down = true;
                self.dragging = false;
                None
            }
            InputEvent::LeftUp => {
                self.left_down = false;
                self.dragging = false;
                self.modifiers = [false; 3];
                if std::mem::take(&mut self.wheel_open) {
                    Some(Action::End)
                } else {
                    None
                }
            }
            InputEvent::ModifierDown(mode) => {
                if std::mem::replace(&mut self.modifiers[mode as usize], true)
                    || !self.left_down
                    || !self.dragging
                {
                    return None;
                }
                if self.wheel_open {
                    Some(Action::Switch(mode))
                } else {
                    self.wheel_open = true;
                    Some(Action::Open(mode))
                }
            }
            InputEvent::ModifierUp(mode) => {
                self.modifiers[mode as usize] = false;
                None
            }
            InputEvent::Escape if self.wheel_open => {
                self.wheel_open = false;
                self.modifiers = [false; 3];
                Some(Action::Cancel)
            }
            InputEvent::Escape => None,
        }
    }
}

fn handle(event: InputEvent) {
    let (Some(app), Some(gesture)) = (APP.get(), GESTURE.get()) else {
        return;
    };
    let action = {
        let Ok(mut state) = gesture.lock() else {
            return;
        };
        state.transition(event)
    };
    let Some(action) = action else { return };
    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || match action {
        Action::Open(mode) => {
            crate::show_drag_quick(&app);
            if !matches!(mode, WheelMode::Convert) {
                let _ = app.emit("flickvert://drag-wheel-mode", mode.name());
            }
        }
        Action::Switch(mode) => {
            let _ = app.emit("flickvert://drag-wheel-mode", mode.name());
        }
        Action::End => {
            let _ = app.emit("flickvert://drag-ended", ());
        }
        Action::Cancel => {
            let _ = app.emit("flickvert://cancel-drag-wheel", ());
        }
    });
}

#[cfg(windows)]
mod windows {
    use super::{handle, InputEvent, ModifierKey, PhysicalModifiers};
    use std::{ffi::c_void, mem, ptr, sync::{Mutex, OnceLock}, thread};

    type Hook = *mut c_void;
    type HookProc = Option<unsafe extern "system" fn(i32, usize, isize) -> isize>;

    #[repr(C)]
    struct Point {
        x: i32,
        y: i32,
    }

    #[repr(C)]
    struct MouseData {
        point: Point,
        mouse_data: u32,
        flags: u32,
        time: u32,
        extra: usize,
    }

    #[repr(C)]
    struct KeyData {
        key: u32,
        scan: u32,
        flags: u32,
        time: u32,
        extra: usize,
    }

    #[repr(C)]
    struct Message {
        hwnd: *mut c_void,
        message: u32,
        wparam: usize,
        lparam: isize,
        time: u32,
        point: Point,
        private: u32,
    }

    const WH_KEYBOARD_LL: i32 = 13;
    const WH_MOUSE_LL: i32 = 14;
    const WM_KEYDOWN: u32 = 0x0100;
    const WM_KEYUP: u32 = 0x0101;
    const WM_SYSKEYDOWN: u32 = 0x0104;
    const WM_SYSKEYUP: u32 = 0x0105;
    const WM_LBUTTONDOWN: u32 = 0x0201;
    const WM_LBUTTONUP: u32 = 0x0202;
    const WM_MOUSEMOVE: u32 = 0x0200;
    const VK_SHIFT: u32 = 0x10;
    const VK_LSHIFT: u32 = 0xa0;
    const VK_RSHIFT: u32 = 0xa1;
    const VK_CONTROL: u32 = 0x11;
    const VK_LCONTROL: u32 = 0xa2;
    const VK_RCONTROL: u32 = 0xa3;
    const VK_MENU: u32 = 0x12;
    const VK_LMENU: u32 = 0xa4;
    const VK_RMENU: u32 = 0xa5;
    const VK_ESCAPE: u32 = 0x1b;
    const LLKHF_EXTENDED: u32 = 0x01;
    const MAPVK_VSC_TO_VK_EX: u32 = 3;
    static PHYSICAL_MODIFIERS: OnceLock<Mutex<PhysicalModifiers>> = OnceLock::new();

    #[link(name = "user32")]
    extern "system" {
        fn SetWindowsHookExW(id: i32, proc: HookProc, module: *mut c_void, thread: u32) -> Hook;
        fn CallNextHookEx(hook: Hook, code: i32, wparam: usize, lparam: isize) -> isize;
        fn GetMessageW(message: *mut Message, window: *mut c_void, min: u32, max: u32) -> i32;
        fn TranslateMessage(message: *const Message) -> i32;
        fn DispatchMessageW(message: *const Message) -> isize;
        fn MapVirtualKeyW(code: u32, map_type: u32) -> u32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetModuleHandleW(name: *const u16) -> *mut c_void;
    }

    pub fn start() {
        let _ = thread::Builder::new()
            .name("flickvert-input".into())
            .spawn(|| unsafe {
                let module = GetModuleHandleW(ptr::null());
                let mouse = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), module, 0);
                let keyboard = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), module, 0);
                if mouse.is_null() || keyboard.is_null() {
                    eprintln!("Could not install FlickVert input hooks");
                    return;
                }
                let mut message: Message = mem::zeroed();
                while GetMessageW(&mut message, ptr::null_mut(), 0, 0) > 0 {
                    TranslateMessage(&message);
                    DispatchMessageW(&message);
                }
            });
    }

    unsafe extern "system" fn mouse_proc(code: i32, message: usize, data: isize) -> isize {
        if code >= 0 {
            let input = &*(data as *const MouseData);
            match message as u32 {
                WM_LBUTTONDOWN => handle(InputEvent::LeftDown(
                    input.point.x as f64,
                    input.point.y as f64,
                )),
                WM_MOUSEMOVE => {
                    handle(InputEvent::Move(input.point.x as f64, input.point.y as f64));
                }
                WM_LBUTTONUP => handle(InputEvent::LeftUp),
                _ => {}
            }
        }
        CallNextHookEx(ptr::null_mut(), code, message, data)
    }

    unsafe extern "system" fn keyboard_proc(code: i32, message: usize, data: isize) -> isize {
        if code >= 0 {
            let input = &*(data as *const KeyData);
            let key = match input.key {
                VK_SHIFT | VK_CONTROL | VK_MENU => {
                    let scan_code = input.scan | if input.flags & LLKHF_EXTENDED != 0 { 0xe000 } else { 0 };
                    MapVirtualKeyW(scan_code, MAPVK_VSC_TO_VK_EX)
                }
                _ => input.key,
            };
            match (message as u32, key) {
                (WM_KEYDOWN | WM_SYSKEYDOWN, VK_LSHIFT | VK_RSHIFT) => {
                    update_modifier(ModifierKey::Shift, key == VK_RSHIFT, true)
                }
                (WM_KEYUP | WM_SYSKEYUP, VK_LSHIFT | VK_RSHIFT) => {
                    update_modifier(ModifierKey::Shift, key == VK_RSHIFT, false)
                }
                (WM_KEYDOWN | WM_SYSKEYDOWN, VK_LCONTROL | VK_RCONTROL) => {
                    update_modifier(ModifierKey::Control, key == VK_RCONTROL, true)
                }
                (WM_KEYUP | WM_SYSKEYUP, VK_LCONTROL | VK_RCONTROL) => {
                    update_modifier(ModifierKey::Control, key == VK_RCONTROL, false)
                }
                (WM_KEYDOWN | WM_SYSKEYDOWN, VK_LMENU | VK_RMENU) => {
                    update_modifier(ModifierKey::Alt, key == VK_RMENU, true)
                }
                (WM_KEYUP | WM_SYSKEYUP, VK_LMENU | VK_RMENU) => {
                    update_modifier(ModifierKey::Alt, key == VK_RMENU, false)
                }
                (WM_KEYDOWN | WM_SYSKEYDOWN, VK_ESCAPE) => handle(InputEvent::Escape),
                _ => {}
            }
        }
        CallNextHookEx(ptr::null_mut(), code, message, data)
    }

    fn update_modifier(key: ModifierKey, right: bool, down: bool) {
        let modifiers = PHYSICAL_MODIFIERS.get_or_init(|| Mutex::new(PhysicalModifiers::default()));
        if let Ok(mut modifiers) = modifiers.lock() {
            if let Some(event) = modifiers.update(key, right, down) { handle(event); }
        }
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::{handle, mode_for_modifier, InputEvent, ModifierKey};
    use std::{ffi::c_void, thread};

    #[repr(C)]
    struct Point {
        x: f64,
        y: f64,
    }

    type Callback = unsafe extern "C" fn(*mut c_void, u32, *mut c_void, *mut c_void) -> *mut c_void;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn CGEventTapCreate(
            location: u32,
            placement: u32,
            options: u32,
            mask: u64,
            callback: Callback,
            user_info: *mut c_void,
        ) -> *mut c_void;
        fn CGEventGetLocation(event: *mut c_void) -> Point;
        fn CGEventGetFlags(event: *mut c_void) -> u64;
        fn CGEventGetIntegerValueField(event: *mut c_void, field: u32) -> i64;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFMachPortCreateRunLoopSource(
            allocator: *const c_void,
            port: *mut c_void,
            order: isize,
        ) -> *mut c_void;
        fn CFRunLoopGetCurrent() -> *mut c_void;
        fn CFRunLoopAddSource(run_loop: *mut c_void, source: *mut c_void, mode: *const c_void);
        fn CFRunLoopRun();
        static kCFRunLoopCommonModes: *const c_void;
    }

    pub fn start() {
        let _ = thread::Builder::new()
            .name("flickvert-input".into())
            .spawn(|| unsafe {
                let mask = (1_u64 << 1)
                    | (1_u64 << 2)
                    | (1_u64 << 3)
                    | (1_u64 << 4)
                    | (1_u64 << 6)
                    | (1_u64 << 7)
                    | (1_u64 << 10)
                    | (1_u64 << 12);
                let tap = CGEventTapCreate(0, 0, 1, mask, event_proc, std::ptr::null_mut());
                if tap.is_null() {
                    eprintln!("FlickVert needs Accessibility permission for Shift-drag on macOS");
                    return;
                }
                let source = CFMachPortCreateRunLoopSource(std::ptr::null(), tap, 0);
                let run_loop = CFRunLoopGetCurrent();
                CFRunLoopAddSource(run_loop, source, kCFRunLoopCommonModes);
                CFRunLoopRun();
            });
    }

    unsafe extern "C" fn event_proc(
        _: *mut c_void,
        event_type: u32,
        event: *mut c_void,
        _: *mut c_void,
    ) -> *mut c_void {
        let point = CGEventGetLocation(event);
        match event_type {
            1 => handle(InputEvent::LeftDown(point.x, point.y)),
            2 => handle(InputEvent::LeftUp),
            3 => handle(InputEvent::LeftDown(point.x, point.y)),
            4 => handle(InputEvent::LeftUp),
            6 | 7 => handle(InputEvent::Move(point.x, point.y)),
            12 => {
                let flags = CGEventGetFlags(event);
                for (key, bit) in [
                    (ModifierKey::Shift, 1 << 17),
                    (ModifierKey::Control, 1 << 20),
                    (ModifierKey::Alt, 1 << 18),
                ] {
                    let mode = mode_for_modifier(key);
                    handle(if flags & bit != 0 {
                        InputEvent::ModifierDown(mode)
                    } else {
                        InputEvent::ModifierUp(mode)
                    });
                }
            }
            10 if CGEventGetIntegerValueField(event, 9) == 53 => handle(InputEvent::Escape),
            _ => {}
        }
        event
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shift_opens_wheel_during_drag() {
        let mut gesture = Gesture::default();
        assert!(gesture
            .transition(InputEvent::LeftDown(10.0, 10.0))
            .is_none());
        assert!(gesture.transition(InputEvent::Move(20.0, 10.0)).is_none());
        assert!(matches!(
            gesture.transition(InputEvent::ModifierDown(WheelMode::Convert)),
            Some(Action::Open(WheelMode::Convert))
        ));
        assert!(gesture
            .transition(InputEvent::ModifierUp(WheelMode::Convert))
            .is_none());
    }

    #[test]
    fn opens_wheel_when_drag_starts_with_modifier_held() {
        let mut gesture = Gesture::default();
        gesture.transition(InputEvent::ModifierDown(WheelMode::Convert));
        gesture.transition(InputEvent::LeftDown(10.0, 10.0));
        assert!(gesture.transition(InputEvent::Move(16.0, 10.0)).is_none());
        assert!(matches!(
            gesture.transition(InputEvent::Move(20.0, 10.0)),
            Some(Action::Open(WheelMode::Convert))
        ));
    }

    #[test]
    fn switches_wheel_while_dragging() {
        let mut gesture = Gesture::default();
        gesture.transition(InputEvent::LeftDown(10.0, 10.0));
        gesture.transition(InputEvent::Move(20.0, 10.0));
        gesture.transition(InputEvent::ModifierDown(WheelMode::Convert));
        assert!(matches!(
            gesture.transition(InputEvent::ModifierDown(WheelMode::Tools)),
            Some(Action::Switch(WheelMode::Tools))
        ));
    }

    #[test]
    fn tools_and_actions_open_directly_during_drag() {
        let mut gesture = Gesture::default();
        gesture.transition(InputEvent::LeftDown(10.0, 10.0));
        assert!(gesture.transition(InputEvent::Move(20.0, 10.0)).is_none());
        assert!(matches!(
            gesture.transition(InputEvent::ModifierDown(WheelMode::Tools)),
            Some(Action::Open(WheelMode::Tools))
        ));
        assert!(gesture
            .transition(InputEvent::ModifierUp(WheelMode::Tools))
            .is_none());
        assert!(matches!(
            gesture.transition(InputEvent::ModifierDown(WheelMode::Actions)),
            Some(Action::Switch(WheelMode::Actions))
        ));
        assert!(matches!(
            gesture.transition(InputEvent::LeftUp),
            Some(Action::End)
        ));
    }

    #[test]
    fn held_tools_key_opens_tools_when_drag_starts() {
        let mut gesture = Gesture::default();
        gesture.transition(InputEvent::ModifierDown(WheelMode::Tools));
        gesture.transition(InputEvent::LeftDown(10.0, 10.0));
        assert!(matches!(
            gesture.transition(InputEvent::Move(20.0, 10.0)),
            Some(Action::Open(WheelMode::Tools))
        ));
    }

    #[test]
    fn releasing_one_side_of_a_held_modifier_keeps_the_other_side_active() {
        let mut keys = PhysicalModifiers::default();
        let mut gesture = Gesture::default();
        gesture.transition(keys.update(ModifierKey::Shift, false, true).unwrap());
        assert!(keys.update(ModifierKey::Shift, true, true).is_none());
        gesture.transition(InputEvent::LeftDown(10.0, 10.0));
        assert!(matches!(
            gesture.transition(InputEvent::Move(20.0, 10.0)),
            Some(Action::Open(WheelMode::Convert))
        ));
        assert!(keys.update(ModifierKey::Shift, false, false).is_none());
        assert!(keys.update(ModifierKey::Shift, true, false).is_some());
    }

    #[test]
    fn wheel_stays_open_after_key_release_and_cancels_on_escape() {
        let mut gesture = Gesture::default();
        gesture.transition(InputEvent::LeftDown(10.0, 10.0));
        gesture.transition(InputEvent::Move(20.0, 10.0));
        assert!(matches!(
            gesture.transition(InputEvent::ModifierDown(WheelMode::Convert)),
            Some(Action::Open(WheelMode::Convert))
        ));
        assert!(gesture
            .transition(InputEvent::ModifierUp(WheelMode::Convert))
            .is_none());
        assert!(matches!(
            gesture.transition(InputEvent::Escape),
            Some(Action::Cancel)
        ));
        assert!(gesture.transition(InputEvent::LeftUp).is_none());
    }
}
