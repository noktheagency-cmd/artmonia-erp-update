"use client";

import Image from "next/image";
import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { Camera, Check, ImagePlus, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { unwrapActionResult } from "@/lib/action-result";
import { notifyCaughtError } from "@/lib/app-notifications";

type ProfilePhotoAction = (formData: FormData) => Promise<unknown>;

export function ProfilePhotoEditor({
  fullName,
  initialPhotoUrl,
  action,
}: {
  fullName: string;
  initialPhotoUrl: string;
  action: ProfilePhotoAction;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceFileName, setSourceFileName] = useState("profile.webp");
  const [zoom, setZoom] = useState(1);
  const [positionX, setPositionX] = useState(50);
  const [positionY, setPositionY] = useState(50);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice("JPEG, PNG və ya WebP şəkli seçin.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setNotice("Şəkil 8 MB-dan böyük ola bilməz.");
      return;
    }
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceUrl(URL.createObjectURL(file));
    setSourceFileName(file.name);
    setZoom(1);
    setPositionX(50);
    setPositionY(50);
    setNotice("");
  }

  function save() {
    if (!sourceUrl) return;
    startTransition(async () => {
      try {
        const cropped = await cropSquare(sourceUrl, zoom, positionX, positionY, sourceFileName);
        const formData = new FormData();
        formData.set("profilePhoto", cropped);
        const result = unwrapActionResult(await action(formData)) as { profilePhotoUrl: string };
        setPhotoUrl(result.profilePhotoUrl);
        URL.revokeObjectURL(sourceUrl);
        setSourceUrl("");
        setNotice("Profil şəkli yeniləndi.");
      } catch (error) {
        setNotice(notifyCaughtError(error, "Profil şəkli yenilənmədi."));
      }
    });
  }

  return (
    <section className="profile-photo-card" aria-busy={pending}>
      <div className="profile-photo-current">
        {photoUrl ? <Image src={photoUrl} alt={`${fullName} profil şəkli`} fill sizes="112px" unoptimized /> : <span>{initials(fullName)}</span>}
      </div>
      <div className="profile-photo-copy">
        <span>Profil şəkli</span>
        <h2>{fullName}</h2>
        <p>Şəkli seçin, yaxınlaşdırın və görünəcək hissəni tənzimləyin.</p>
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={pending}>
          <ImagePlus data-icon="inline-start" /> Şəkil seç
        </Button>
        <input ref={inputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectFile} />
      </div>

      {sourceUrl ? (
        <div className="profile-photo-editor">
          <div className="profile-photo-crop-window">
            {/* A local blob preview cannot use next/image. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sourceUrl} alt="Profil şəklinin tənzimləmə önizləməsi" style={{ transform: `scale(${zoom})`, objectPosition: `${positionX}% ${positionY}%` }} />
          </div>
          <div className="profile-photo-controls">
            <label><span>Yaxınlaşdırma</span><input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
            <label><span>Sağa / sola</span><input type="range" min="0" max="100" value={positionX} onChange={(event) => setPositionX(Number(event.target.value))} /></label>
            <label><span>Yuxarı / aşağı</span><input type="range" min="0" max="100" value={positionY} onChange={(event) => setPositionY(Number(event.target.value))} /></label>
          </div>
          <div className="profile-photo-editor-actions">
            <Button type="button" variant="ghost" onClick={() => { URL.revokeObjectURL(sourceUrl); setSourceUrl(""); }} disabled={pending}><X data-icon="inline-start" /> Ləğv et</Button>
            <Button type="button" onClick={save} disabled={pending}>{pending ? <LoaderCircle className="is-spin" data-icon="inline-start" /> : <Check data-icon="inline-start" />} Yadda saxla</Button>
          </div>
        </div>
      ) : null}
      {notice ? <p className="profile-photo-notice" role="status"><Camera /> {notice}</p> : null}
    </section>
  );
}

async function cropSquare(sourceUrl: string, zoom: number, positionX: number, positionY: number, sourceName: string) {
  const image = await loadImage(sourceUrl);
  const baseCrop = Math.min(image.naturalWidth, image.naturalHeight);
  const cropSize = baseCrop / zoom;
  const sx = Math.max(0, (image.naturalWidth - cropSize) * (positionX / 100));
  const sy = Math.max(0, (image.naturalHeight - cropSize) * (positionY / 100));
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Şəkil emal edilə bilmədi.");
  context.drawImage(image, sx, sy, cropSize, cropSize, 0, 0, 512, 512);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Şəkil hazırlanmadı.")), "image/webp", 0.88));
  return new File([blob], `${sourceName.replace(/\.[^.]+$/, "").slice(0, 80) || "profile"}.webp`, { type: "image/webp" });
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Şəkil açıla bilmədi."));
    image.src = url;
  });
}

function initials(value: string) {
  return value.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("az");
}
