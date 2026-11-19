# Argument validators.
#
# Small checks for user-facing arguments, so each kind of argument fails with
# the same cli message and the rules live in one place. Each helper returns its
# (possibly normalised) input or aborts with an error attributed to `call`,
# which defaults to the function that called the helper -- so the user sees
# `as_widget()` in the error, not `.check_bool()`.
#
# Conventions (mirroring vellum's R/validate.R, but self-contained):
# * `arg` is the argument name as the user typed it, used in the message.
# * `allow_null = TRUE` lets an optional argument pass through as `NULL`.

# A single `TRUE` or `FALSE` (no `NA`, no vector).
.check_bool <- function(x, arg, allow_null = FALSE, call = parent.frame()) {
  if (is.null(x) && allow_null) {
    return(NULL)
  }
  if (!is.logical(x) || length(x) != 1L || is.na(x)) {
    cli::cli_abort(
      "{.arg {arg}} must be {.code TRUE} or {.code FALSE}, not {.obj_type_friendly {x}}.",
      call = call
    )
  }
  x
}

# A single finite number, optionally bounded below. `min_inclusive = FALSE`
# makes `min` an exclusive bound (strictly positive, say). Returns a double.
.check_number <- function(
  x,
  arg,
  min = -Inf,
  min_inclusive = TRUE,
  allow_null = FALSE,
  call = parent.frame()
) {
  if (is.null(x) && allow_null) {
    return(NULL)
  }
  if (!is.numeric(x) || length(x) != 1L || !is.finite(x)) {
    cli::cli_abort(
      "{.arg {arg}} must be a single finite number, not {.obj_type_friendly {x}}.",
      call = call
    )
  }
  too_small <- if (min_inclusive) x < min else x <= min
  if (too_small) {
    rel <- if (min_inclusive) "at least" else "greater than"
    cli::cli_abort(
      "{.arg {arg}} must be {rel} {min}, not {x}.",
      call = call
    )
  }
  as.double(x)
}

# A single non-missing string. `allow_empty = FALSE` also refuses `""`.
.check_string <- function(
  x,
  arg,
  allow_null = FALSE,
  allow_empty = TRUE,
  call = parent.frame()
) {
  if (is.null(x) && allow_null) {
    return(NULL)
  }
  if (!is.character(x) || length(x) != 1L || is.na(x)) {
    cli::cli_abort(
      "{.arg {arg}} must be a single string, not {.obj_type_friendly {x}}.",
      call = call
    )
  }
  if (!allow_empty && !nzchar(x)) {
    cli::cli_abort("{.arg {arg}} must not be the empty string.", call = call)
  }
  x
}

# One of a fixed set of strings, `match.arg()`-style: when `x` is the whole
# `choices` vector (the formal's default) the first choice is taken.
.check_choice <- function(x, choices, arg, call = parent.frame()) {
  if (identical(x, choices)) {
    return(choices[[1L]])
  }
  if (!is.character(x) || length(x) != 1L || is.na(x) || !x %in% choices) {
    shown <- if (is.character(x) && length(x) == 1L) {
      cli::format_inline("{.val {x}}")
    } else {
      cli::format_inline("{.obj_type_friendly {x}}")
    }
    cli::cli_abort(
      c(
        "{.arg {arg}} must be one of {.or {.val {choices}}}, not {shown}.",
        i = if (is.character(x) && length(x) > 1L) "Supply a single value."
      ),
      call = call
    )
  }
  x
}

# A widget size: `NULL`, a single non-negative number (pixels), or a single CSS
# size string (e.g. `"100%"`, `"400px"`) -- what htmlwidgets::createWidget()
# accepts.
.check_css_size <- function(x, arg, call = parent.frame()) {
  if (is.null(x)) {
    return(NULL)
  }
  if (is.numeric(x)) {
    return(.check_number(x, arg, min = 0, call = call))
  }
  if (is.character(x) && length(x) == 1L && !is.na(x) && nzchar(x)) {
    return(x)
  }
  cli::cli_abort(
    c(
      "{.arg {arg}} must be a number of pixels or a CSS size string, not {.obj_type_friendly {x}}.",
      i = "For example {.code 400} or {.val 100%}."
    ),
    call = call
  )
}
