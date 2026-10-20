#[derive(Clone, Copy)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

pub fn clamp_window_position(pointer: (i32, i32), window: (u32, u32), area: Rect) -> (i32, i32) {
    let max_x = area.x + area.width.saturating_sub(window.0) as i32;
    let max_y = area.y + area.height.saturating_sub(window.1) as i32;
    (
        (pointer.0 - (window.0 / 2) as i32).clamp(area.x, max_x),
        (pointer.1 - (window.1 / 2) as i32).clamp(area.y, max_y),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn clamps_quick_window_to_each_work_area_edge() {
        let area = Rect {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        };
        assert_eq!(clamp_window_position((0, 0), (400, 360), area), (0, 0));
        assert_eq!(
            clamp_window_position((1919, 1079), (400, 360), area),
            (1520, 720)
        );
        assert_eq!(
            clamp_window_position((960, 540), (400, 360), area),
            (760, 360)
        );
    }
}
