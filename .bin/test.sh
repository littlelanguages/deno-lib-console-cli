#!/bin/bash

deno fmt --check

if [[ "$?" != "0" ]]
then
    exit -1
fi

deno test
