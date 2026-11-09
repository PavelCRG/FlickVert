use calamine::{open_workbook, Reader, Xlsx};
use std::{fs::File, path::Path};

const MAX_SPREADSHEET_BYTES: u64 = 128 * 1024 * 1024;
const MAX_SPREADSHEET_EXPANDED_BYTES: u64 = 256 * 1024 * 1024;
const MAX_SPREADSHEET_CELLS: u64 = 2_000_000;

pub fn spreadsheet_to_delimited(
    input: &Path,
    output: &Path,
    output_extension: &str,
) -> Result<(), String> {
    let delimiter = match output_extension.to_ascii_lowercase().as_str() {
        "csv" => b',',
        "tsv" => b'\t',
        _ => return Err("unsupported delimited format".into()),
    };
    validate_spreadsheet_size(input)?;
    if input
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
        != Some("xlsx")
    {
        return Err("only XLSX workbooks are supported by the built-in converter".into());
    }
    let mut workbook: Xlsx<_> =
        open_workbook::<Xlsx<_>, _>(input).map_err(|error| error.to_string())?;
    let sheet_names = workbook.sheet_names();
    if sheet_names.len() != 1 {
        return Err("CSV and TSV can only contain one spreadsheet sheet".into());
    }
    let mut cells = workbook
        .worksheet_cells_reader(&sheet_names[0])
        .map_err(|error| error.to_string())?;
    let mut writer = csv::WriterBuilder::new()
        .delimiter(delimiter)
        .flexible(true)
        .from_writer(File::create(output).map_err(|error| error.to_string())?);
    let mut row = 0u32;
    let mut values = Vec::new();
    let mut has_cells = false;
    while let Some(cell) = cells.next_cell().map_err(|error| error.to_string())? {
        let (cell_row, cell_column) = cell.get_position();
        validate_cell_position(cell_row, cell_column)?;
        if cell_row < row {
            return Err("spreadsheet cells are not ordered".into());
        }
        while row < cell_row {
            writer
                .write_record(&values)
                .map_err(|error| error.to_string())?;
            values.clear();
            row += 1;
        }
        values.resize(cell_column as usize + 1, String::new());
        values[cell_column as usize] =
            csv_safe_value(calamine::Data::from(cell.get_value().clone()));
        has_cells = true;
    }
    if has_cells {
        writer
            .write_record(&values)
            .map_err(|error| error.to_string())?;
    }
    writer.flush().map_err(|error| error.to_string())
}

fn validate_cell_position(row: u32, column: u32) -> Result<(), String> {
    (u64::from(row) + 1)
        .checked_mul(u64::from(column) + 1)
        .filter(|cells| *cells <= MAX_SPREADSHEET_CELLS)
        .map(|_| ())
        .ok_or_else(|| "spreadsheet exceeds the 2,000,000-cell output limit".into())
}

fn csv_safe_value(value: calamine::Data) -> String {
    match value {
        calamine::Data::String(text)
            if matches!(
                text.trim_start_matches([' ', '\t', '\r', '\n'])
                    .chars()
                    .next(),
                Some('=' | '+' | '-' | '@')
            ) =>
        {
            format!("'{text}")
        }
        value => value.to_string(),
    }
}

fn validate_spreadsheet_size(input: &Path) -> Result<(), String> {
    let size = std::fs::metadata(input)
        .map_err(|error| error.to_string())?
        .len();
    if size > MAX_SPREADSHEET_BYTES {
        return Err("spreadsheet exceeds the 128 MiB input limit".into());
    }
    if !matches!(
        input
            .extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("xlsx")
    ) {
        return Ok(());
    }
    let mut archive = zip::ZipArchive::new(File::open(input).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())?;
    if archive.len() > 10_000 {
        return Err("spreadsheet contains too many entries".into());
    }
    let mut expanded_size = 0u64;
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|error| error.to_string())?;
        expanded_size = expanded_size
            .checked_add(entry.size())
            .filter(|size| *size <= MAX_SPREADSHEET_EXPANDED_BYTES)
            .ok_or_else(|| "spreadsheet exceeds the 256 MiB expanded limit".to_owned())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        sync::atomic::{AtomicU64, Ordering},
    };

    static TEMP_ID: AtomicU64 = AtomicU64::new(0);

    fn temp_path(suffix: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!(
            "flickvert-sheet-{}-{}",
            std::process::id(),
            TEMP_ID.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).unwrap();
        path.join(suffix)
    }

    #[test]
    fn converts_one_xlsx_sheet_to_tsv_and_quotes_embedded_tabs() {
        let input = temp_path("input.xlsx");
        let output = input.with_file_name("output.tsv");
        let mut workbook = rust_xlsxwriter::Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.write_string(0, 0, "name").unwrap();
        sheet.write_string(0, 1, "note").unwrap();
        sheet.write_string(1, 0, "Alice").unwrap();
        sheet.write_string(1, 1, "left\tright").unwrap();
        sheet.write_string(2, 0, "=1+1").unwrap();
        workbook.save(&input).unwrap();

        spreadsheet_to_delimited(&input, &output, "tsv").unwrap();

        let mut reader = csv::ReaderBuilder::new()
            .delimiter(b'\t')
            .has_headers(false)
            .flexible(true)
            .from_path(&output)
            .unwrap();
        let rows = reader.records().collect::<Result<Vec<_>, _>>().unwrap();
        assert_eq!(rows[0].get(0), Some("name"));
        assert_eq!(rows[1].get(1), Some("left\tright"));
        assert_eq!(rows[2].get(0), Some("'=1+1"));
        fs::remove_dir_all(input.parent().unwrap()).unwrap();
    }

    #[test]
    fn refuses_multi_sheet_workbooks_instead_of_dropping_data() {
        let input = temp_path("input.xlsx");
        let output = input.with_file_name("output.csv");
        let mut workbook = rust_xlsxwriter::Workbook::new();
        workbook.add_worksheet().write_string(0, 0, "one").unwrap();
        workbook.add_worksheet().write_string(0, 0, "two").unwrap();
        workbook.save(&input).unwrap();

        assert!(spreadsheet_to_delimited(&input, &output, "csv").is_err());
        assert!(!output.exists());
        fs::remove_dir_all(input.parent().unwrap()).unwrap();
    }

    #[test]
    fn rejects_sparse_cells_that_would_expand_to_a_huge_grid() {
        let input = temp_path("sparse.xlsx");
        let output = input.with_file_name("output.csv");
        let mut workbook = rust_xlsxwriter::Workbook::new();
        workbook
            .add_worksheet()
            .write_string(1_048_575, 16_383, "far away")
            .unwrap();
        workbook.save(&input).unwrap();

        assert!(spreadsheet_to_delimited(&input, &output, "csv").is_err());
        assert_eq!(fs::metadata(&output).unwrap().len(), 0);
        fs::remove_dir_all(input.parent().unwrap()).unwrap();
    }

    #[test]
    fn rejects_overflowing_cell_positions() {
        assert!(validate_cell_position(u32::MAX, u32::MAX).is_err());
    }
}
