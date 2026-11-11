use std::{
    fs::{self, File},
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
};

use symphonia::core::{
    audio::SampleBuffer,
    codecs::DecoderOptions,
    errors::Error,
    formats::FormatOptions,
    io::{MediaSourceStream, MediaSourceStreamOptions},
    meta::MetadataOptions,
    probe::Hint,
};

const MAX_AUDIO_INPUT_BYTES: u64 = 512 * 1024 * 1024;
const MAX_AUDIO_OUTPUT_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_AUDIO_CHANNELS: u16 = 8;

pub fn convert_to_wav(input: &Path, output: &Path, cancelled: &AtomicBool) -> Result<(), String> {
    if fs::metadata(input)
        .map_err(|error| error.to_string())?
        .len()
        > MAX_AUDIO_INPUT_BYTES
    {
        return Err("audio input exceeds the size limit".into());
    }

    let file = File::open(input).map_err(|error| error.to_string())?;
    let stream = MediaSourceStream::new(Box::new(file), MediaSourceStreamOptions::default());
    let mut hint = Hint::new();
    if let Some(extension) = input.extension().and_then(|value| value.to_str()) {
        hint.with_extension(extension);
    }
    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            stream,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|error| error.to_string())?;
    let mut format = probed.format;
    let track = format
        .tracks()
        .iter()
        .find(|track| {
            track.codec_params.channels.is_some() && track.codec_params.sample_rate.is_some()
        })
        .ok_or("no supported audio track")?;
    let track_id = track.id;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|error| error.to_string())?;
    let mut writer = None;
    let mut output_samples = 0u64;
    let mut output_spec = None;

    loop {
        if cancelled.load(Ordering::Acquire) {
            return Err("conversion cancelled".into());
        }
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(Error::IoError(error)) if error.kind() == std::io::ErrorKind::UnexpectedEof => {
                break
            }
            Err(error) => return Err(error.to_string()),
        };
        if packet.track_id() != track_id {
            continue;
        }
        let decoded = decoder.decode(&packet).map_err(|error| error.to_string())?;
        let spec = *decoded.spec();
        let channels = u16::try_from(spec.channels.count()).map_err(|error| error.to_string())?;
        if channels == 0 || channels > MAX_AUDIO_CHANNELS {
            return Err("unsupported audio channel count".into());
        }
        if output_spec.is_some_and(|expected| expected != (spec.rate, channels)) {
            return Err("audio track changes format while decoding".into());
        }
        output_spec = Some((spec.rate, channels));
        let mut samples = SampleBuffer::<i16>::new(decoded.capacity() as u64, spec);
        samples.copy_interleaved_ref(decoded);
        let chunk = samples.samples();
        output_samples = output_samples.saturating_add(chunk.len() as u64);
        if output_samples.saturating_mul(2) > MAX_AUDIO_OUTPUT_BYTES {
            return Err("audio output exceeds the size limit".into());
        }
        if writer.is_none() {
            let wav_spec = hound::WavSpec {
                channels,
                sample_rate: spec.rate,
                bits_per_sample: 16,
                sample_format: hound::SampleFormat::Int,
            };
            writer = Some(
                hound::WavWriter::create(output, wav_spec).map_err(|error| error.to_string())?,
            );
        }
        let writer = writer.as_mut().unwrap();
        for sample in chunk {
            writer
                .write_sample(*sample)
                .map_err(|error| error.to_string())?;
        }
    }

    if cancelled.load(Ordering::Acquire) {
        return Err("conversion cancelled".into());
    }
    if output_samples == 0 {
        return Err("audio file contains no decodable samples".into());
    }
    writer
        .ok_or("audio file contains no decodable samples")?
        .finalize()
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        sync::atomic::{AtomicBool, AtomicU64, Ordering},
    };

    static NEXT_TEST: AtomicU64 = AtomicU64::new(0);

    fn temp_paths() -> (PathBuf, PathBuf) {
        let root = std::env::temp_dir().join(format!(
            "flickvert-audio-test-{}-{}",
            std::process::id(),
            NEXT_TEST.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&root).unwrap();
        (root.join("input.wav"), root.join("output.wav"))
    }

    fn pcm_wave(samples: &[i16]) -> Vec<u8> {
        let data_size = (samples.len() * 2) as u32;
        let mut wav = Vec::new();
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&(36 + data_size).to_le_bytes());
        wav.extend_from_slice(b"WAVEfmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&8_000u32.to_le_bytes());
        wav.extend_from_slice(&16_000u32.to_le_bytes());
        wav.extend_from_slice(&2u16.to_le_bytes());
        wav.extend_from_slice(&16u16.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&data_size.to_le_bytes());
        for sample in samples {
            wav.extend_from_slice(&sample.to_le_bytes());
        }
        wav
    }

    #[test]
    fn decodes_pcm_to_a_valid_wav_without_changing_samples() {
        let (input, output) = temp_paths();
        let samples = [0, 1000, -1000, i16::MAX];
        fs::write(&input, pcm_wave(&samples)).unwrap();

        super::convert_to_wav(&input, &output, &AtomicBool::new(false)).unwrap();

        let result = fs::read(&output).unwrap();
        assert_eq!(&result[..4], b"RIFF");
        assert_eq!(&result[8..12], b"WAVE");
        assert_eq!(&result[44..], &pcm_wave(&samples)[44..]);
        let _ = fs::remove_dir_all(input.parent().unwrap());
    }

    #[test]
    fn refuses_malformed_audio_without_leaving_output() {
        let (input, output) = temp_paths();
        fs::write(&input, b"not audio").unwrap();

        assert!(super::convert_to_wav(&input, &output, &AtomicBool::new(false)).is_err());
        assert!(!output.exists());
        let _ = fs::remove_dir_all(input.parent().unwrap());
    }

    #[test]
    fn cancellation_stops_before_writing_the_output() {
        let (input, output) = temp_paths();
        fs::write(&input, pcm_wave(&[1, 2, 3])).unwrap();
        let cancelled = AtomicBool::new(true);

        assert!(super::convert_to_wav(&input, &output, &cancelled).is_err());
        assert!(!output.exists());
        let _ = fs::remove_dir_all(input.parent().unwrap());
    }
}
