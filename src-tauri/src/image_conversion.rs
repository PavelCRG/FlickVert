#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgba};
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn test_dir() -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!(
            "flickvert-rust-image-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn converts_png_to_jpeg_with_white_alpha_background_and_bounded_resize() {
        let root = test_dir();
        let input = root.join("input.png");
        let output = root.join("output.jpg");
        ImageBuffer::from_pixel(4, 2, Rgba([255u8, 0, 0, 128]))
            .save(&input)
            .unwrap();

        convert_image(&input, &output, "jpg", 90, Some(2), Some(2)).unwrap();

        let decoded = image::open(&output).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (2, 1));
        let pixel = decoded.to_rgb8().get_pixel(0, 0).0;
        assert!(
            pixel[1] > 90 && pixel[1] < 165,
            "unexpected alpha composite: {pixel:?}"
        );
        assert!(
            pixel[2] > 90 && pixel[2] < 165,
            "unexpected alpha composite: {pixel:?}"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn caps_decoded_image_pixels_without_integer_overflow() {
        assert!(image_dimensions_allowed(10_000, 10_000));
        assert!(!image_dimensions_allowed(10_001, 10_000));
        assert!(!image_dimensions_allowed(u32::MAX, u32::MAX));
    }

    #[test]
    fn refuses_unimplemented_output_formats() {
        let root = test_dir();
        let input = root.join("input.png");
        let output = root.join("output.svg");
        ImageBuffer::from_pixel(1, 1, Rgba([0u8, 0, 0, 255]))
            .save(&input)
            .unwrap();

        assert!(convert_image(&input, &output, "svg", 90, None, None).is_err());
        assert!(!output.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn converts_heic_without_external_codec_processes() {
        let root = test_dir();
        let input = root.join("input.png");
        let heic = root.join("output.heic");
        let output = root.join("roundtrip.png");
        ImageBuffer::from_pixel(2, 2, Rgba([20u8, 40, 60, 255]))
            .save(&input)
            .unwrap();

        convert_image(&input, &heic, "heic", 88, None, None).unwrap();
        convert_image(&heic, &output, "png", 88, None, None).unwrap();

        let decoded = image::open(output).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (2, 2));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn converts_images_to_a_single_page_pdf_in_process() {
        let root = test_dir();
        let input = root.join("input.png");
        let output = root.join("output.pdf");
        ImageBuffer::from_pixel(2, 1, Rgba([20u8, 40, 60, 255]))
            .save(&input)
            .unwrap();

        convert_image(&input, &output, "pdf", 88, None, None).unwrap();

        let pdf = fs::read(&output).unwrap();
        assert!(pdf.starts_with(b"%PDF-1.4"));
        assert!(pdf
            .windows(b"/Subtype /Image".len())
            .any(|part| part == b"/Subtype /Image"));
        assert!(pdf
            .windows(b"/DCTDecode".len())
            .any(|part| part == b"/DCTDecode"));
        let text = String::from_utf8_lossy(&pdf);
        let xref_offset: usize = text
            .rsplit_once("startxref\n")
            .unwrap()
            .1
            .lines()
            .next()
            .unwrap()
            .parse()
            .unwrap();
        assert_eq!(&pdf[xref_offset..xref_offset + 4], b"xref");
        fs::remove_dir_all(root).unwrap();
    }
}
use image::{DynamicImage, ImageEncoder, ImageFormat, ImageReader};
use std::{fs::File, io::BufWriter, path::Path, sync::Once};

static HEIC_HOOKS: Once = Once::new();
const MAX_IMAGE_PIXELS: u64 = 100_000_000;

pub fn convert_image(
    input: &Path,
    output: &Path,
    extension: &str,
    quality: u8,
    width: Option<u32>,
    height: Option<u32>,
) -> Result<(), String> {
    if !matches!(
        extension,
        "png" | "jpg" | "jpeg" | "webp" | "bmp" | "tif" | "tiff" | "avif" | "heic" | "heif" | "pdf"
    ) {
        return Err("unsupported image output".into());
    }
    HEIC_HOOKS.call_once(|| {
        heifer::image_crate::register_image_decoder_hooks();
    });
    let input_extension = input
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !matches!(input_extension.as_str(), "heic" | "heif") {
        let (image_width, image_height) = ImageReader::open(input)
            .map_err(|error| format!("open input: {error}"))?
            .with_guessed_format()
            .map_err(|error| format!("detect input format: {error}"))?
            .into_dimensions()
            .map_err(|error| format!("read image dimensions: {error}"))?;
        if !image_dimensions_allowed(image_width, image_height) {
            return Err("image exceeds the pixel limit".into());
        }
    }
    let mut reader = ImageReader::open(input)
        .map_err(|error| format!("open input: {error}"))?
        .with_guessed_format()
        .map_err(|error| format!("detect input format: {error}"))?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(32_768);
    limits.max_image_height = Some(32_768);
    reader.limits(limits);
    let mut image = reader
        .decode()
        .map_err(|error| format!("decode input: {error}"))?;
    if width == Some(0) || height == Some(0) {
        return Err("invalid image dimensions".into());
    }
    let max_width = width.unwrap_or(image.width());
    let max_height = height.unwrap_or(image.height());
    if image.width() > max_width || image.height() > max_height {
        image = image.resize(max_width, max_height, image::imageops::FilterType::Lanczos3);
    }
    if matches!(extension, "heic" | "heif") {
        return image
            .write_with_encoder(heifer::image_crate::HeifEncoder::new(
                File::create(output).map_err(|error| error.to_string())?,
            ))
            .map_err(|error| error.to_string());
    }
    if extension == "pdf" {
        let rgb = image_to_white_rgb(image);
        let mut jpeg = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, quality.clamp(1, 100))
            .write_image(
                rgb.as_raw(),
                rgb.width(),
                rgb.height(),
                image::ExtendedColorType::Rgb8,
            )
            .map_err(|error| error.to_string())?;
        return write_image_pdf(output, &jpeg, rgb.width(), rgb.height());
    }
    let format = ImageFormat::from_extension(extension).ok_or("unsupported image output")?;
    let file = BufWriter::new(File::create(output).map_err(|error| error.to_string())?);
    match format {
        ImageFormat::Jpeg => {
            let rgb = image_to_white_rgb(image);
            image::codecs::jpeg::JpegEncoder::new_with_quality(file, quality.clamp(1, 100))
                .write_image(
                    rgb.as_raw(),
                    rgb.width(),
                    rgb.height(),
                    image::ExtendedColorType::Rgb8,
                )
                .map_err(|error| format!("encode JPEG: {error}"))
        }
        ImageFormat::Avif => {
            image::codecs::avif::AvifEncoder::new_with_speed_quality(file, 8, quality.clamp(1, 100))
                .write_image(
                    image.to_rgba8().as_raw(),
                    image.width(),
                    image.height(),
                    image::ExtendedColorType::Rgba8,
                )
                .map_err(|error| format!("encode AVIF: {error}"))
        }
        format => image
            .save_with_format(output, format)
            .map_err(|error| format!("encode output: {error}")),
    }
}

fn image_dimensions_allowed(width: u32, height: u32) -> bool {
    u64::from(width) * u64::from(height) <= MAX_IMAGE_PIXELS
}

fn write_image_pdf(output: &Path, jpeg: &[u8], width: u32, height: u32) -> Result<(), String> {
    let page_width = 595.276;
    let page_height = 841.89;
    let scale = (page_width / f64::from(width)).min(page_height / f64::from(height));
    let draw_width = f64::from(width) * scale;
    let draw_height = f64::from(height) * scale;
    let x = (page_width - draw_width) / 2.0;
    let y = (page_height - draw_height) / 2.0;
    let content = format!("q\n{draw_width:.3} 0 0 {draw_height:.3} {x:.3} {y:.3} cm\n/Im0 Do\nQ\n");
    let mut pdf = b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n".to_vec();
    let mut offsets = [0usize; 6];
    let mut object = |id: usize, body: &[u8]| {
        offsets[id] = pdf.len();
        pdf.extend_from_slice(format!("{id} 0 obj\n").as_bytes());
        pdf.extend_from_slice(body);
        pdf.extend_from_slice(b"\nendobj\n");
    };
    object(1, b"<< /Type /Catalog /Pages 2 0 R >>");
    object(2, b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    object(3, format!("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {page_width:.3} {page_height:.3}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>").as_bytes());
    let mut image = format!("<< /Type /XObject /Subtype /Image /Width {width} /Height {height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length {} >>\nstream\n", jpeg.len()).into_bytes();
    image.extend_from_slice(jpeg);
    image.extend_from_slice(b"\nendstream");
    object(4, &image);
    object(
        5,
        format!(
            "<< /Length {} >>\nstream\n{}endstream",
            content.len(),
            content
        )
        .as_bytes(),
    );
    let xref_offset = pdf.len();
    pdf.extend_from_slice(b"xref\n0 6\n0000000000 65535 f \n");
    for offset in &offsets[1..] {
        pdf.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }
    pdf.extend_from_slice(
        format!("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n").as_bytes(),
    );
    std::fs::write(output, pdf).map_err(|error| error.to_string())
}

fn image_to_white_rgb(image: DynamicImage) -> image::RgbImage {
    let rgba = image.to_rgba8();
    image::ImageBuffer::from_fn(rgba.width(), rgba.height(), |x, y| {
        let [r, g, b, a] = rgba.get_pixel(x, y).0;
        let blend = |channel: u8| {
            ((u16::from(channel) * u16::from(a) + 255 * u16::from(255 - a)) / 255) as u8
        };
        image::Rgb([blend(r), blend(g), blend(b)])
    })
}
