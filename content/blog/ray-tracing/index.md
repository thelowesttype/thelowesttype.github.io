+++
title = "Creating my own world - Ray Tracing"
description = "Generating images out of thin air using ray tracing engine"
date = 2021-10-21T07:13:50Z
updated = 2022-07-03T07:13:50Z
draft = false
template = "blog/page.html"

[taxonomies]
authors = ["Saksham"]

[extra]
lead = '$ g++ main.cc -lpthread && ./a.out >>splashOfLife'
math = true
+++

## Overview?
I stepped into the world or renders and ray tracing via Blender. This intrigued me to understand how this beautiful world of ray tracing works. So here is my first attempt at it :)

Here is a scene rendered by the engine 

<br>
<div style="display: block; margin-left: auto; margin-right: auto; width: 100%; ">
    <figure>
        <img src="/blog/ray-tracing/img_26min.png" class="center"></img>
        <figcaption>splashOfLife</figcaption>
    </figure>
</div>
<br>

We can see the depth info of the scene by looking at the normal surface of the sphere represented in psuedo-color space
 
<br>
<div style="display: block; margin-left: auto; margin-right: auto; width: 100%; ">
    <figure>
        <img src="/blog/ray-tracing/normalsL.png" class="center"></img>
        <figcaption>splashOfLife.naked</figcaption>
    </figure>
</div>
<br>

Things it can do as of now :

1. Multi thread rendering: Take my word for it good sire.

2. Anti-aliasing
<br>
<div style="display: block; margin-left: auto; margin-right: auto; width: 100%; ">
    <figure>
        <img src="/blog/ray-tracing/aliasing.png" class="center"></img>
        <figcaption>Different levels of anti-aliasing</figcaption>
    </figure>
</div>
<br>

3. Albedo control: Albedo here refers to how much light the object reflects

<br>
<div style="display: block; margin-left: auto; margin-right: auto; width: 100%; ">
    <figure>
        <img src="/blog/ray-tracing/img_albedo.gif" class="center"></img>
        <figcaption>Normals of the surface</figcaption>
    </figure>
</div>
<br>

4. Raytracer sampling control: Allows to make decision between time and clarity for renders. 

<br>
<div style="display: block; margin-left: auto; margin-right: auto; width: 100%; ">
    <figure>
        <img src="/blog/ray-tracing/samples.gif" class="center"></img>
        <figcaption>Comparision of renders with different sampling level</figcaption>
    </figure>
</div>
<br>

5. Accurate Lambertian diffusion method: This allows to fake a good render without having to do high sampling

<br>
<div style="display: block; margin-left: auto; margin-right: auto; width: 100%; ">
    <figure>
        <img src="/blog/ray-tracing/diffusion method.gif" class="center"></img>
        <figcaption>Lambertian diffusion</figcaption>
    </figure>
</div>
<br>

6. Gamma correction: For accurate representation of colors for human eye.

<br>
<div style="display: block; margin-left: auto; margin-right: auto; width: 100%; ">
    <figure>
        <img src="/blog/ray-tracing/gammaL.png" class="center"></img>
        <figcaption>Gamma Correction</figcaption>
    </figure>
</div>
<br>


7. Temperature Control

<br>
<div style="display: block; margin-left: auto; margin-right: auto; width: 100%; ">
    <figure>
        <img src="/blog/ray-tracing/tempratureLabled.png" class="center"></img>
        <figcaption>Gamma Correction</figcaption>
    </figure>
</div>
<br>

8. Reflective Materials

<br>
<div style="display: block; margin-left: auto; margin-right: auto; width: 100%; ">
    <figure>
        <img src="/blog/ray-tracing/img.png" class="center"></img>
        <figcaption>Aluminium with pure reflection </figcaption>
    </figure>
</div>
<br>

<br>
<div style="display: block; margin-left: auto; margin-right: auto; width: 100%; ">
    <figure>
        <img src="/blog/ray-tracing/img3.png" class="center"></img>
        <figcaption>Aluminium with brushed reflection</figcaption>
    </figure>
</div>
<br>

## Up-Next
Will be implementing transparent material soon. Long way to go, strap on major!

<br>
<div style="display: block; margin-left: auto; margin-right: auto; width: 100%; ">
    <figure>
        <img src="/blog/ray-tracing/img.jpg" class="center"></img>
        <figcaption>Blank canvas up ahead</figcaption>
    </figure>
</div>
<br>

<br>

*Also fun-fact you can subscribe to the blog using RSS! For Firefox users you can use [Livemark](https://addons.mozilla.org/en-US/firefox/addon/livemarks/?utm_source=addons.mozilla.org&utm_medium=referral&utm_content=search) for this.*

<span style="color:green">$</span> press <kbd>CTRL</kbd>+<kbd>W</kbd> to end the session.
