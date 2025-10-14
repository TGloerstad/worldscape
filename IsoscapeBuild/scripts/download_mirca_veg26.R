suppressPackageStartupMessages({
  library(utils)
})

`%||%` <- function(x, y) if (is.null(x) || length(x) == 0) y else x

# Resolve paths
caller_file <- tryCatch({ if (exists(".__file__", inherits = TRUE)) get(".__file__", inherits = TRUE) else NULL }, error = function(e) NULL)
args_all <- commandArgs(trailingOnly = FALSE)
file_arg <- tryCatch({ fa <- sub('^--file=','', args_all[grep('^--file=', args_all)][1]); if (!is.na(fa) && nzchar(fa)) fa else NULL }, error = function(e) NULL)
this_file <- file_arg %||% caller_file %||% "scripts/download_mirca_veg26.R"
script_dir <- tryCatch(normalizePath(dirname(this_file), winslash = "/", mustWork = FALSE), error = function(e) getwd())
root <- tryCatch(normalizePath(file.path(script_dir, ".."), winslash = "/", mustWork = FALSE), error = function(e) getwd())
raw_mirca <- file.path(root, "data_raw", "mirca")
dir.create(raw_mirca, recursive = TRUE, showWarnings = FALSE)

# Parse CLI or env for URLs
args <- commandArgs(trailingOnly = TRUE)
get_flag <- function(name, default = NULL) {
  m1 <- which(args == paste0("--", name))
  m2 <- grep(paste0("^--", name, "="), args)
  if (length(m1) == 1 && length(args) >= m1 + 1) return(args[m1 + 1])
  if (length(m2) == 1) return(sub(paste0("^--", name, "="), "", args[m2]))
  Sys.getenv(toupper(name), unset = default)
}

i_url <- get_flag("i_url", "")  # MGAG irrigated ZIP URL
r_url <- get_flag("r_url", "")  # MGAG rainfed ZIP URL

if (!nzchar(i_url) || !nzchar(r_url)) {
  message("Provide direct URLs to MIRCA MGAG zip files with --i_url= and --r_url=\n",
          "Example (placeholders):\n",
          "  Rscript scripts/download_mirca_veg26.R --i_url=\"https://.../MGAG_I.zip\" --r_url=\"https://.../MGAG_R.zip\"\n",
          "Or set env vars I_URL / R_URL. Files will be downloaded to ", raw_mirca)
  quit(status = 2)
}

dest_i <- file.path(raw_mirca, basename(i_url))
dest_r <- file.path(raw_mirca, basename(r_url))

dl <- function(url, dest) {
  if (file.exists(dest) && file.info(dest)$size > 1024) return(TRUE)
  message("[dl] ", url)
  download.file(url, destfile = dest, mode = "wb", quiet = FALSE)
  file.exists(dest) && file.info(dest)$size > 1024
}

ok_i <- dl(i_url, dest_i)
ok_r <- dl(r_url, dest_r)
if (!ok_i || !ok_r) stop("Download failed. Check URLs or network and retry.")

unz_i <- file.path(raw_mirca, "unz_i")
unz_r <- file.path(raw_mirca, "unz_r")
dir.create(unz_i, showWarnings = FALSE)
dir.create(unz_r, showWarnings = FALSE)

unzip(dest_i, exdir = unz_i)
unzip(dest_r, exdir = unz_r)

find_file <- function(d, pattern) {
  cands <- list.files(d, pattern = pattern, full.names = TRUE, recursive = TRUE)
  cands[1] %||% ""
}

bin_i <- find_file(unz_i, "mgag_i_26\\.bin$")
bin_r <- find_file(unz_r, "mgag_r_26\\.bin$")
if (!nzchar(bin_i) || !nzchar(bin_r)) stop("mgag_i_26.bin or mgag_r_26.bin not found in ZIPs.")

file.copy(bin_i, file.path(raw_mirca, "mgag_i_26.bin"), overwrite = TRUE)
file.copy(bin_r, file.path(raw_mirca, "mgag_r_26.bin"), overwrite = TRUE)
message("[mirca] Ready: ", file.path(raw_mirca, "mgag_i_26.bin"))
message("[mirca] Ready: ", file.path(raw_mirca, "mgag_r_26.bin"))




