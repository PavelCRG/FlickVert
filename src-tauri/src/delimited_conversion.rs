#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn converts_csv_to_tsv_and_back_with_quotes_and_newlines() {
        let root = std::env::temp_dir().join(format!(
            "flickvert-delimited-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let csv = root.join("input.csv");
        let tsv = root.join("output.tsv");
        let roundtrip = root.join("roundtrip.csv");
        fs::write(
            &csv,
            "name,note\nAlice,\"hello, world\"\nBob,\"two\nlines\"\n",
        )
        .unwrap();

        convert_delimited(&csv, &tsv, "tsv").unwrap();
        convert_delimited(&tsv, &roundtrip, "csv").unwrap();

        let mut reader = csv::ReaderBuilder::new()
            .has_headers(false)
            .from_path(roundtrip)
            .unwrap();
        let rows = reader.records().collect::<Result<Vec<_>, _>>().unwrap();
        assert_eq!(rows[0].get(0), Some("name"));
        assert_eq!(rows[1].get(1), Some("hello, world"));
        assert_eq!(rows[2].get(1), Some("two\nlines"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn converts_tsv_to_xlsx_as_text_cells() {
        let root = std::env::temp_dir().join(format!(
            "flickvert-xlsx-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let tsv = root.join("input.tsv");
        let xlsx = root.join("output.xlsx");
        fs::write(&tsv, "name\tnote\nAlice\t=1+1\n").unwrap();

        convert_delimited(&tsv, &xlsx, "xlsx").unwrap();

        let mut archive = zip::ZipArchive::new(File::open(xlsx).unwrap()).unwrap();
        let mut contents = String::new();
        for index in 0..archive.len() {
            let mut file = archive.by_index(index).unwrap();
            if file.name().starts_with("xl/") {
                let _ = file.read_to_string(&mut contents);
            }
        }
        assert!(contents.contains("=1+1"));
        assert!(!contents.contains("<f>"));
        fs::remove_dir_all(root).unwrap();
    }
}
use std::{fs::File, path::Path};

pub fn convert_delimited(
    input: &Path,
    output: &Path,
    output_extension: &str,
) -> Result<(), String> {
    let input_extension = input
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    let delimiter = |extension: &str| match extension.to_ascii_lowercase().as_str() {
        "csv" => Ok(b','),
        "tsv" => Ok(b'\t'),
        _ => Err("unsupported delimited format".to_owned()),
    };
    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter(input_extension)?)
        .has_headers(false)
        .flexible(true)
        .from_path(input)
        .map_err(|error| error.to_string())?;
    if output_extension.eq_ignore_ascii_case("xlsx") {
        let mut workbook = rust_xlsxwriter::Workbook::new();
        let worksheet = workbook
            .add_worksheet_with_constant_memory()
            .map_err(|error| error.to_string())?;
        for (row, record) in reader.records().enumerate() {
            let row = u32::try_from(row).map_err(|_| "XLSX row limit exceeded".to_owned())?;
            for (column, value) in record
                .map_err(|error| error.to_string())?
                .iter()
                .enumerate()
            {
                let column =
                    u16::try_from(column).map_err(|_| "XLSX column limit exceeded".to_owned())?;
                worksheet
                    .write_string(row, column, value)
                    .map_err(|error| error.to_string())?;
            }
        }
        return workbook.save(output).map_err(|error| error.to_string());
    }
    let mut writer = csv::WriterBuilder::new()
        .delimiter(delimiter(output_extension)?)
        .from_writer(File::create(output).map_err(|error| error.to_string())?);
    for record in reader.records() {
        writer
            .write_record(&record.map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
    }
    writer.flush().map_err(|error| error.to_string())
}
