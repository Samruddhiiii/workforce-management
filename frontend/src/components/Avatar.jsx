// src/components/Avatar.jsx
// Profile photo, or the person's initials if there is no photo
// (or the file is missing on the server - old sample data).
import { useEffect, useState } from 'react';
import { fileUrl } from '../services/api';
import { initials } from '../utils/format';

export default function Avatar({ name, photoUrl, size = 40 }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photoUrl]); // new photo -> try again
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (photoUrl && !failed) {
    return <img className="avatar" style={style} src={fileUrl(photoUrl)} alt={name || 'Profile photo'} onError={() => setFailed(true)} />;
  }
  return (
    <span className="avatar avatar-initials" style={style} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
