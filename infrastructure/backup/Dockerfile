# Daily encrypted dumps of the database. The image holds the PUBLIC half of an `age` key only: whoever steals the
# backups (or this machine) still cannot read them without the private key, which lives somewhere else.
FROM alpine:3.21
RUN apk add --no-cache postgresql16-client age tzdata \
 && adduser -D -u 1000 backup
COPY backup.sh restore.sh /usr/local/bin/
RUN chmod 0755 /usr/local/bin/backup.sh /usr/local/bin/restore.sh
USER backup
ENTRYPOINT ["/usr/local/bin/backup.sh"]
