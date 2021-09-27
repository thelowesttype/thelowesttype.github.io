+++
title = "Quick Start"
description = "One page summary of how to setup gImageGrabber"
date = 2021-09-28T13:40:16Z
updated = 2021-09-28T13:40:16Z
draft = false
weight = 2
sort_by = "weight"
template = "projects/page.html"

[extra]
lead = "One page summary of how to setup gImageGrabber"
toc = true
top = true
current_index = 2
+++

Installation
------------

To install gImageGrabber do as follow:

``` bash
$ pip install gImageGrabber
```

There are two python files *imgScrape* and *imgTools*.

*imgScrape* has all the utilities needed to run the script but if you
want to have additional control over the functions you could explore
*imgTools*. *Simple*

Importing
---------

To import this module to your script do this :

``` python
from gimagegrabber import imgScrape
from gimagegrabber import imgTools
```
