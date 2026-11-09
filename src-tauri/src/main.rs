#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;
mod archive;
mod commands;
mod files;
mod file_signatures;
mod input;
mod operations;
mod quick_window;
mod selection;
mod shell_integration;
mod state;
mod workspaces;

use commands::*;
use state::*;
use workspaces::*;
use std::{
    collections::{HashMap, HashSet},
    ffi::OsString,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Output, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, Position, Size, WebviewUrl,
    WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

const QUICK_WIDTH: u32 = 400;
const QUICK_HEIGHT: u32 = 400;

fn main() {
    app::run();
}
