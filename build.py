"""Empacota extension/ em downloads/henkkes-player.vsix e atualiza o instalador.

Uso: python build.py
"""
import base64
import io
import json
import os
import re
import textwrap
import zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
EXT = os.path.join(ROOT, "extension")
BUILD = os.path.join(ROOT, "build")
VSIX = os.path.join(ROOT, "downloads", "henkkes-player.vsix")
CMD = os.path.join(ROOT, "downloads", "instalar-henkkes-player.cmd")
PAYLOAD_MARK = "::PAYLOAD::"


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def build_vsix():
    pkg = json.loads(read(os.path.join(EXT, "package.json")))
    manifest = read(os.path.join(BUILD, "extension.vsixmanifest"))
    # Só o <Identity>: o <PackageManifest> também tem um Version, que é o do formato.
    def identity(m):
        tag = re.sub(r'Version="[^"]+"', f'Version="{pkg["version"]}"', m.group(0))
        return re.sub(r'Id="[^"]+"', f'Id="{pkg["name"]}"', tag)
    manifest = re.sub(r"<Identity[^>]*/>", identity, manifest, count=1)
    manifest = re.sub(r"<DisplayName>.*?</DisplayName>", f"<DisplayName>{pkg['displayName']}</DisplayName>", manifest)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("extension.vsixmanifest", manifest)
        z.write(os.path.join(BUILD, "[Content_Types].xml"), "[Content_Types].xml")
        for dirpath, _, files in os.walk(EXT):
            for name in sorted(files):
                full = os.path.join(dirpath, name)
                rel = os.path.relpath(full, EXT).replace(os.sep, "/")
                z.write(full, "extension/" + rel)
    data = buf.getvalue()
    with open(VSIX, "wb") as f:
        f.write(data)
    return pkg["version"], data


def update_installer(data):
    cmd = read(CMD)
    head = cmd[: cmd.rindex(PAYLOAD_MARK)]
    b64 = base64.b64encode(data).decode()
    with open(CMD, "w", encoding="utf-8", newline="\r\n") as f:
        f.write(head + PAYLOAD_MARK + "\n" + "\n".join(textwrap.wrap(b64, 76)) + "\n")
    # Confere que o payload embutido é o mesmo .vsix.
    cmd = read(CMD)
    embedded = base64.b64decode("".join(cmd[cmd.rindex(PAYLOAD_MARK) + len(PAYLOAD_MARK):].split()))
    assert embedded == data, "payload do instalador não bate com o .vsix"


if __name__ == "__main__":
    version, data = build_vsix()
    update_installer(data)
    print(f"henkkes-player {version}: {len(data)} bytes -> {os.path.relpath(VSIX, ROOT)}, {os.path.relpath(CMD, ROOT)}")
