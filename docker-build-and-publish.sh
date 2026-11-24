#!/bin/bash

sudo docker build -t yoto-backup .
sudo docker tag yoto-backup nicjansma/yoto-backup:latest
sudo docker push nicjansma/yoto-backup:latest