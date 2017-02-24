#!/bin/bash

PATH=./node_modules/.bin:$PATH

localtunnel() {
  lt --subdomain ziadsaab --port 8888
}

until localtunnel; do
  sleep 1
done
