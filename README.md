# yoto-backup

* [nicjansma/yoto-backup github](https://github.com/nicjansma/yoto-backup)
* [nicjansma/yoto-backup docker image](https://hub.docker.com/r/nicjansma/yoto-backup)

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

1. Copy `config.example.json` to `config.json` and supply your [Yoto developer credentials](https://dashboard.yoto.dev/)
   1. You'll need to create a _Public Client_ and get the _Client ID_ which goes into the `clientId` field in `config.json`

2. Log in via the credentials:

    ```sh
    node login.js
    ```

    A file `device-auth.json` should have been created.

3. Run the backup script:

    ```sh
    node backup-cards-from-web.js [output directory]
    ```

## Docker

Available as a docker image:

```sh

# backup-cards-from-web.sj
docker run -v ./:/home/ -v /my-path-to-cards/:/data/ nicjansma:yoto-backup

# backup-cards-from-sd.sj
docker run -v ./:/home/ -v /my-path-to-cards/:/data/ -v /my-path-to-sd-card/:/sd/ nicjansma:yoto-backup node backup-cards-from-sd.js /sd/ /data/
```

## Version History

* 2024-11-22: v1.0: Initial release
* 2025-12-27: v1.1: Updated per Yoto APIs
  * **Breaking change**: For `backup-cards-from-web.js` you'll need to `login.js` first
