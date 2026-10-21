use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

#[derive(Default)]
struct Gesture {
    cursor: (f64, f64),
    start: (f64, f64),
    left_down: bool,
    dragging: bool,
    shift_down: bool,
    wheel_open: bool,
}

enum InputEvent {
    Move(f64, f64),
    LeftDown(f64, f64),
    LeftUp,
    ShiftDown,
    ShiftUp,
    Escape,
}

enum Action {
    Open,
    End,
    Cancel,
}

static APP: OnceLock<AppHandle> = OnceLock::new();
static GESTURE: OnceLock<Mutex<Gesture>> = OnceLock::new();

pub fn start(app: AppHandle) {
    let _ = APP.set(app);
    let _ = GESTURE.set(Mutex::new(Gesture::default()));

    #[cfg(windows)]
    windows::start();
    #[cfg(target_os = "macos")]
    macos::start();
}

fn handle(event: InputEvent) {
    let (Some(app), Some(gesture)) = (APP.get(), GESTURE.get()) else {
        return;
    };
    let action = {
        let Ok(mut state) = gesture.lock() else {
            return;
        };
        match event {
            InputEvent::Move(x, y) => {
                state.cursor = (x, y);
                if state.left_down
                    && !state.dragging
                    && ((x - state.start.0).abs() >= 8.0 || (y - state.start.1).abs() >= 8.0)
                {
                    state.dragging = true;
                }
                None
            }
            InputEvent::LeftDown(x, y) => {
                state.cursor = (x, y);
                state.start = (x, y);
                state.left_down = true;
                state.dragging = false;
                None
            }
            InputEvent::LeftUp => {
                state.left_down = false;
                state.dragging = false;
                if std::mem::take(&mut state.wheel_open) {
                    Some(Action::End)
                } else {
                    None
                }
            }
            InputEvent::ShiftDown => {
                state.shift_down = true;
                None
            }
            InputEvent::ShiftUp => {
                // shortcut: use Sweetch's left-drag + Shift gesture; support right-click after adding native file selection.
                let tapped_during_drag = std::mem::take(&mut state.shift_down)
                    && state.left_down
                    && state.dragging
                    && !state.wheel_open;
                if tapped_during_drag {
                    state.wheel_open = true;
                    Some(Action::Open)
                } else {
                    None
                }
            }
            InputEvent::Escape if state.wheel_open => {
                state.wheel_open = false;
                Some(Action::Cancel)
            }
            InputEvent::Escape => None,
        }
    };
    match action {
        Some(Action::Open) => crate::show_drag_quick(app),
        Some(Action::End) => {
            let _ = app.emit("flickvert://drag-ended", ());
        }
        Some(Action::Cancel) => {
            let _ = app.emit("flickvert://cancel-drag-wheel", ());
        }
        None => {}
    }
}

#[cfg(windows)]
mod windows {
    use super::{handle, InputEvent};
    use std::{ffi::c_void, mem, ptr, thread};

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
    const VK_ESCAPE: u32 = 0x1b;

    #[link(name = "user32")]
    extern "system" {
        fn SetWindowsHookExW(id: i32, proc: HookProc, module: *mut c_void, thread: u32) -> Hook;
        fn CallNextHookEx(hook: Hook, code: i32, wparam: usize, lparam: isize) -> isize;
        fn GetMessageW(message: *mut Message, window: *mut c_void, min: u32, max: u32) -> i32;
        fn TranslateMessage(message: *const Message) -> i32;
        fn DispatchMessageW(message: *const Message) -> isize;
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
            match (message as u32, input.key) {
                (WM_KEYDOWN | WM_SYSKEYDOWN, VK_SHIFT | VK_LSHIFT | VK_RSHIFT) => {
                    handle(InputEvent::ShiftDown)
                }
                (WM_KEYUP | WM_SYSKEYUP, VK_SHIFT | VK_LSHIFT | VK_RSHIFT) => {
                    handle(InputEvent::ShiftUp)
                }
                (WM_KEYDOWN | WM_SYSKEYDOWN, VK_ESCAPE) => handle(InputEvent::Escape),
                _ => {}
            }
        }
        CallNextHookEx(ptr::null_mut(), code, message, data)
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::{handle, InputEvent};
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
                let mask =
                    (1_u64 << 1) | (1_u64 << 2) | (1_u64 << 6) | (1_u64 << 10) | (1_u64 << 12);
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
            6 => handle(InputEvent::Move(point.x, point.y)),
            12 if CGEventGetFlags(event) & (1 << 17) != 0 => handle(InputEvent::ShiftDown),
            12 => handle(InputEvent::ShiftUp),
            10 if CGEventGetIntegerValueField(event, 9) == 53 => handle(InputEvent::Escape),
            _ => {}
        }
        event
    }
}
