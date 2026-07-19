import Pantalla from '../components/Pantalla';
import { useAuth } from '../context/useAuth';

export default function Agenda() {
  const { salon } = useAuth();
  return (
    <Pantalla titulo="Agenda" subtitulo={salon?.nombre}>
      <div className="card p-5 text-[14.5px] text-stone">
        Aquí irá la agenda por día y semana.
      </div>
    </Pantalla>
  );
}
