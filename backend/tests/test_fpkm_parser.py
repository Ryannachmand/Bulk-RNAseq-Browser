import os
import pytest
from app.parsers.fpkm_matrix import FPKMParseError, parse_fpkm_matrix

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def _read(name: str) -> bytes:
    with open(os.path.join(FIXTURES, name), "rb") as f:
        return f.read()


# ── R index column (unnamed header cell) ─────────────────────────────────────

def test_r_index_genes_become_index():
    df = parse_fpkm_matrix(_read("fpkm_with_r_index.csv"), "fpkm_with_r_index.csv")
    assert df.index.name == "gene"
    assert list(df.index) == ["GAPDH", "ACTB", "TP53", "MYC"]


def test_r_index_samples_are_columns():
    df = parse_fpkm_matrix(_read("fpkm_with_r_index.csv"), "fpkm_with_r_index.csv")
    assert list(df.columns) == ["Sample_A_1", "Sample_A_2", "Sample_B_1", "Sample_B_2"]


def test_r_index_values_correct():
    df = parse_fpkm_matrix(_read("fpkm_with_r_index.csv"), "fpkm_with_r_index.csv")
    assert df.loc["GAPDH", "Sample_A_1"] == pytest.approx(23.5)
    assert df.loc["TP53", "Sample_B_2"] == pytest.approx(1.9)


# ── Named gene column (no R index artifact) ───────────────────────────────────

def test_named_col_genes_become_index():
    df = parse_fpkm_matrix(_read("fpkm_without_r_index.csv"), "fpkm_without_r_index.csv")
    assert df.index.name == "gene"
    assert list(df.index) == ["GAPDH", "ACTB", "TP53", "MYC"]


def test_named_col_values_correct():
    df = parse_fpkm_matrix(_read("fpkm_without_r_index.csv"), "fpkm_without_r_index.csv")
    assert df.loc["GAPDH", "Sample_A_1"] == pytest.approx(23.5)
    assert df.loc["MYC", "Sample_B_2"] == pytest.approx(0.0)


# ── Both fixtures must produce identical DataFrames ───────────────────────────

def test_both_fixtures_identical():
    df_r = parse_fpkm_matrix(_read("fpkm_with_r_index.csv"), "a.csv")
    df_named = parse_fpkm_matrix(_read("fpkm_without_r_index.csv"), "b.csv")
    assert df_r.shape == df_named.shape
    assert list(df_r.index) == list(df_named.index)
    assert list(df_r.columns) == list(df_named.columns)
    assert (df_r.values == df_named.values).all()


# ── Zero-variance gene row (MYC) is parsed without error ─────────────────────

def test_zero_variance_gene_present():
    df = parse_fpkm_matrix(_read("fpkm_with_r_index.csv"), "a.csv")
    assert "MYC" in df.index
    assert (df.loc["MYC"] == 0.0).all()


# ── Error cases ───────────────────────────────────────────────────────────────

def test_numeric_first_col_raises():
    content = b"1.0,2.0,3.0\n4.0,5.0,6.0"
    with pytest.raises(FPKMParseError, match="First column appears to contain numeric"):
        parse_fpkm_matrix(content, "bad.csv")


def test_too_few_sample_cols_raises():
    # After setting gene column as index, only 1 sample column remains
    content = b'"","OnlySample"\n"GAPDH",10.0\n"ACTB",5.0'
    with pytest.raises(FPKMParseError, match="Too few sample columns"):
        parse_fpkm_matrix(content, "bad.csv")


def test_empty_file_raises():
    with pytest.raises(FPKMParseError):
        parse_fpkm_matrix(b"", "empty.csv")
