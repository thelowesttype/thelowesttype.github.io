+++
title = "hello homo.sapien"
description = "Here is to new things!"
date = 	2021-09-27T11:51:33+0000
updated = 2021-09-27T11:51:33+0000
draft = false
template = "blog/page.html"

[taxonomies]
authors = ["Rustaceans"]

[extra]
lead = "Here is to new things!"
+++

```rust
// This is a comment, and is ignored by the compiler

// This is the main function
fn main() {
    // Statements here are executed when the compiled binary is called

    // Print text to the console
    println!("Hello World!");
}
```

`println!` is a macro that prints text to the console.

A binary can be generated using the Rust compiler: `rustc`.

```bash
$ rustc hello.rs
```

`rustc` will produce a `hello` binary that can be executed.

```bash
$ ./hello
Hello World!
```
