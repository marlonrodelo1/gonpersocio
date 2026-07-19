import Pantalla from '../components/Pantalla';
import { useAuth } from '../context/useAuth';

export default function Clientes() {
  const { salon } = useAuth();
  return (
    <Pantalla titulo="Clientes" subtitulo={salon?.nombre}>
      <div className="card p-5 text-[14.5px] text-stone">
        Aquí irá el listado de clientes y su ficha.
      </div>
    </Pantalla>
  );
}
