use image::{codecs::jpeg::JpegEncoder, imageops::FilterType, DynamicImage};
use std::io::Cursor;

const MAX_EDGE: u32 = 1920;
const SOFT_CAP_BYTES: usize = 2 * 1024 * 1024;
const QUALITY_LADDER: &[u8] = &[85, 75, 60];

#[derive(Debug)]
pub struct EncodeOutput {
    pub bytes: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub quality: u8,
}

pub fn encode_for_upload(input: &[u8]) -> Result<EncodeOutput, String> {
    let img = image::load_from_memory(input).map_err(|err| err.to_string())?;
    let resized = downscale_if_needed(img);
    let (width, height) = (resized.width(), resized.height());

    let rgb = DynamicImage::ImageRgb8(resized.into_rgb8());

    for &quality in QUALITY_LADDER {
        let bytes = encode_jpeg(&rgb, quality)?;
        if bytes.len() <= SOFT_CAP_BYTES {
            return Ok(EncodeOutput { bytes, width, height, quality });
        }
    }

    Err(format!(
        "encoded image still exceeds {} bytes at quality {}",
        SOFT_CAP_BYTES,
        QUALITY_LADDER.last().copied().unwrap_or(0)
    ))
}

fn downscale_if_needed(img: DynamicImage) -> DynamicImage {
    let (w, h) = (img.width(), img.height());
    if w <= MAX_EDGE && h <= MAX_EDGE {
        return img;
    }
    img.resize(MAX_EDGE, MAX_EDGE, FilterType::Lanczos3)
}

fn encode_jpeg(img: &DynamicImage, quality: u8) -> Result<Vec<u8>, String> {
    let mut buf = Cursor::new(Vec::new());
    let encoder = JpegEncoder::new_with_quality(&mut buf, quality);
    img.write_with_encoder(encoder).map_err(|err| err.to_string())?;
    Ok(buf.into_inner())
}

#[cfg(test)]
mod tests {
    use super::{encode_for_upload, EncodeOutput};
    use image::{ImageBuffer, ImageFormat, Rgb};
    use std::io::Cursor;

    fn make_png(width: u32, height: u32) -> Vec<u8> {
        let buffer: ImageBuffer<Rgb<u8>, _> =
            ImageBuffer::from_pixel(width, height, Rgb([200u8, 100, 50]));
        let mut out = Cursor::new(Vec::new());
        buffer
            .write_to(&mut out, ImageFormat::Png)
            .unwrap();
        out.into_inner()
    }

    #[test]
    fn encode_downscales_to_max_longest_edge_1920() {
        let png = make_png(3840, 2160);
        let EncodeOutput { bytes, width, height, quality } =
            encode_for_upload(&png).unwrap();
        assert_eq!(width, 1920);
        assert_eq!(height, 1080);
        assert!(bytes.len() < 2 * 1024 * 1024);
        assert_eq!(quality, 85);
    }

    #[test]
    fn encode_does_not_upscale_smaller_than_1920() {
        let png = make_png(800, 600);
        let EncodeOutput { width, height, .. } = encode_for_upload(&png).unwrap();
        assert_eq!(width, 800);
        assert_eq!(height, 600);
    }

    #[test]
    fn encode_preserves_aspect_ratio() {
        let png = make_png(2400, 800);
        let EncodeOutput { width, height, .. } = encode_for_upload(&png).unwrap();
        assert_eq!(width, 1920);
        assert_eq!(height, 640);
    }
}
