import './Card.css';

// The banner uses #0f6cbd in a comment, which must not be counted.
const bannerStyle = {
  backgroundColor: '#0f6cbd',
  color: '#ffffff',
  borderColor: 'rgba(255, 255, 255, 0.2)',
};

const blue = 'not-a-color-name';
const pattern = /#[0-9a-f]{6}/g;

export function Card({ title }: { title: string }) {
  return (
    <div className="card">
      <div className="card__header" style={{ color: '#616161' }}>
        {title}
      </div>
      <div style={bannerStyle}>{blue}</div>
      <svg fill="#0f6cbd" stroke="currentColor" />
      {pattern.source}
    </div>
  );
}
