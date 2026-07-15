# Proxy verbs: drive a rendered widget from the server

Pipe a
[`vellumwidget_proxy()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget_proxy.md)
handle through these to change what an already-rendered widget shows,
without re-rendering it. Each sends one message to the browser and
returns the proxy invisibly, so they chain.

## Usage

``` r
vw_select(proxy, keys)

vw_clear_selection(proxy)

vw_filter(proxy, keys)

vw_clear_filter(proxy)

vw_zoom(proxy, keys)

vw_reset_zoom(proxy)
```

## Arguments

- proxy:

  A
  [`vellumwidget_proxy()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget_proxy.md).

- keys:

  Character vector of element **data keys** (the `data_id`s a
  `vellumplot` mark declares). For `vw_select()`/`vw_filter()` an empty
  vector is meaningful (select nothing / hide everything); use
  `vw_clear_selection()` / `vw_clear_filter()` to *remove* a selection
  or filter. For `vw_zoom()` an empty vector resets to the full view.

## Value

The `proxy`, invisibly (for piping).

## See also

[`vellumwidget_proxy()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget_proxy.md)
