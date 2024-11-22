# yoto-backup

https://github.com/nicjansma/yoto-backup

https://hub.docker.com/r/nicjansma/yoto-backup

## `backup-cards-from-sd.js`

Backup your Yoto card content, via its SD card.

Extracting the microSD card from your Yoto player is beyond the scope of this README, but once accessible, all of the card content (e.g. MP3 files and icons) can be read from it as a backup.

This tool will analyze the files in the SD card, and write human-readable directories and file names for the MP3s and icons.

In addition, in some cases, the player may say it has downloaded a card, but no content was found on the SD card (beyond the bare directory and JSON info).  In those cases, we can use the online Yoto APIs to attempt to download those files as well.

Usage:

1. Have your Yoto player download all cards
2. Extract the SD card
3. (optionally) Copy `config.example.json` to `config.json` and supply your Yoto credentials
4. Run the backup script:

```sh
node backup-cards-from-sd.js [input directory] [output directory]
```

## `backup-cards-from-web.js`

Backup your Yoto card content, via the web.

We can use the Yoto APIs to attempt to download all of your account's content.

Usage:

1. Copy `config.example.json` to `config.json` and supply your Yoto credentials
2. Run the backup script:

```sh
node backup-cards-from-web.js [output directory]
```

## Docker

Available as a docker image:

```sh

# backup-cards-from-web.sj
docker run -v ./config.json:/home/config.json -v /my-path-to-cards/:/data/ nicjansma:yoto-backup

# backup-cards-from-sd.sj
docker run -v ./config.json:/home/config.json -v /my-path-to-cards/:/data/ -v /my-path-to-sd-card/:/sd/ nicjansma:yoto-backup node backup-cards-from-sd.js /sd/ /data/
```
