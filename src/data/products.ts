import { Product } from '../types';

export const products: Product[] = [
  // --- LEGUMES ---
  { id: 'l1', name: 'Alface', price: 1.00, unit: 'un', category: 'legume', image: '', description: 'Alface fresca e crocante.' },
  { id: 'l2', name: 'Alface Folha Carvalho', price: 1.00, unit: 'un', category: 'legume', image: '', description: 'Alface folha de carvalho macia e tenra.' },
  { id: 'l3', name: 'Alho Francês', price: 2.50, unit: 'kg', category: 'legume', image: '', description: 'Alho francês fresco.' },
  { id: 'l4', name: 'Alhos Secos', price: 6.50, unit: 'kg', category: 'legume', image: '', description: 'Alho seco para temperos.' },
  { id: 'l5', name: 'Batata', price: 1.00, unit: 'kg', category: 'legume', image: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=800&auto=format&fit=crop&q=60', description: 'Batata branca ideal para cozer ou fritar.' },
  { id: 'l6', name: 'Batata Olho Perdiz', price: 1.50, unit: 'kg', category: 'legume', image: '', description: 'Batata miúda perfeita para assar com a casca.' },
  { id: 'l7', name: 'Batatinha', price: 1.50, unit: 'kg', category: 'legume', image: '', description: 'Batatinhas para assar.' },
  { id: 'l8', name: 'Batata Doce', price: 1.60, unit: 'kg', category: 'legume', image: '', description: 'Batata doce rica e saborosa.' },
  { id: 'l9', name: 'Batata Doce Laranja', price: 1.50, unit: 'kg', category: 'legume', image: '', description: 'Batata doce de polpa laranja, doce e rica em vitamina A.' },
  { id: 'l10', name: 'Batata Doce Roxa', price: 2.50, unit: 'kg', category: 'legume', image: '', description: 'Batata doce de polpa roxa.' },
  { id: 'l11', name: 'Brócolos', price: 4.00, unit: 'kg', category: 'legume', image: 'https://images.unsplash.com/photo-1452948491233-ad8a1ed01085?w=800&auto=format&fit=crop&q=60', description: 'Brócolos verdes cheios de nutrientes.' },
  { id: 'l12', name: 'Cebola', price: 1.30, unit: 'kg', category: 'legume', image: 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=800&auto=format&fit=crop&q=60', description: 'Cebola seca clássica.' },
  { id: 'l13', name: 'Cebola Nova', price: 1.40, unit: 'kg', category: 'legume', image: '', description: 'Cebola nova.' },
  { id: 'l14', name: 'Cebola Roxa', price: 1.60, unit: 'kg', category: 'legume', image: 'https://images.unsplash.com/photo-1508747703725-719777637510?w=800&auto=format&fit=crop&q=60', description: 'Cebola roxa picante e aromática.' },
  { id: 'l15', name: 'Cenoura', price: 1.00, unit: 'kg', category: 'legume', image: 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=800&auto=format&fit=crop&q=60', description: 'Cenouras crocantes ideais para saladas ou sumos.' },
  { id: 'l16', name: 'Coração', price: 1.80, unit: 'kg', category: 'legume', image: '', description: 'Couve coração macia.' },
  { id: 'l17', name: 'Couve Flor', price: 3.20, unit: 'kg', category: 'legume', image: '', description: 'Couve flor versátil e saborosa.' },
  { id: 'l18', name: 'Curgete', price: 1.80, unit: 'kg', category: 'legume', image: '', description: 'Curgete tenra.' },
  { id: 'l19', name: 'Feijão Verde Nacional', price: 5.50, unit: 'kg', category: 'legume', image: '', description: 'Feijão verde tenro e saboroso.' },
  { id: 'l20', name: 'Favas', price: 2.50, unit: 'kg', category: 'legume', image: '', description: 'Favas verdes frescas.' },
  { id: 'l21', name: 'Ervilhas Tortas', price: 10.00, unit: 'kg', category: 'legume', image: '', description: 'Ervilhas tortas, ideais para saltear.' },
  { id: 'l22', name: 'Ervilhas', price: 3.50, unit: 'kg', category: 'legume', image: '', description: 'Ervilhas no prato.' },
  { id: 'l23', name: 'Lombardo', price: 1.80, unit: 'kg', category: 'legume', image: 'https://images.unsplash.com/photo-1549488344-1f9b8d2bd1f3?w=800&auto=format&fit=crop&q=60', description: 'Couve lombarda.' },
  { id: 'l24', name: 'Limão', price: 1.80, unit: 'kg', category: 'fruta', image: '', description: 'Limão fresco e sumarento.' },
  { id: 'l25', name: 'Nabo', price: 2.50, unit: 'kg', category: 'legume', image: '', description: 'Nabo doce para as suas sopas.' },
  { id: 'l26', name: 'Pepino', price: 2.20, unit: 'kg', category: 'legume', image: '', description: 'Pepino crocante e refrescante.' },
  { id: 'l27', name: 'Pimentos', price: 3.50, unit: 'kg', category: 'legume', image: 'https://images.unsplash.com/photo-1590779033100-9f60a05a013d?w=800&auto=format&fit=crop&q=60', description: 'Pimentos coloridos e crocantes, frescos do mercado.' },
  { id: 'l28', name: 'Tomate Chucha', price: 3.50, unit: 'kg', category: 'legume', image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=800&auto=format&fit=crop&q=60', description: 'Tomate chucha longo.' },
  { id: 'l29', name: 'Tomate Salada', price: 3.00, unit: 'kg', category: 'legume', image: '', description: 'Tomate redondo grande para salada.' },
  { id: 'l30', name: 'Tomate Cherry', price: 7.00, unit: 'kg', category: 'legume', image: '', description: 'Tomate cherry doce e tenro.' },
  { id: 'l31', name: 'Xuxu', price: 3.80, unit: 'kg', category: 'legume', image: '', description: 'Xuxu macio.' },
  { id: 'l32', name: 'Azeitona', price: 5.00, unit: 'kg', category: 'outros', image: '', description: 'Azeitona de mesa curtida.' },
  { id: 'l33', name: 'Tremoços', price: 3.00, unit: 'kg', category: 'outros', image: '', description: 'Tremoços temperados.' },

  // --- MOLHARIAS ---
  { id: 'm1', name: 'Grelo (Couve, Nabo)', price: 2.50, unit: 'molho', category: 'legume', image: '', description: 'Grelos tenros ideais para salto.' },
  { id: 'm2', name: 'Nabiça', price: 2.50, unit: 'molho', category: 'legume', image: '', description: 'Nabiças viçosas.' },
  { id: 'm3', name: 'Espinafre', price: 2.50, unit: 'molho', category: 'legume', image: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=800&auto=format&fit=crop&q=60', description: 'Espinafres frescos.' },
  { id: 'm4', name: 'Rúcula', price: 2.00, unit: 'molho', category: 'legume', image: 'https://images.unsplash.com/photo-1533282960533-51328aa49826?w=800&auto=format&fit=crop&q=60', description: 'Rúcula fresca.' },
  { id: 'm5', name: 'Aromáticas (Salsa, Coentros, Hortelã)', price: 2.00, unit: 'molho', category: 'legume', image: '', description: 'Ervas frescas aromáticas para os seus cozinhados.' },

  // --- FRUTA ---
  { id: 'f1', name: 'Abacate', price: 5.00, unit: 'kg', category: 'fruta', image: '', description: 'Abacate maduro no ponto, perfeito na salada.' },
  { id: 'f2', name: 'Abacaxi', price: 2.00, unit: 'kg', category: 'fruta', image: '', description: 'Abacaxi tropical bastante docinho.' },
  { id: 'f3', name: 'Banana', price: 1.50, unit: 'kg', category: 'fruta', image: '', description: 'Banana docinha.' },
  { id: 'f4', name: 'Clementina', price: 1.90, unit: 'kg', category: 'fruta', image: '', description: 'Clementina cheia de sumo sem caroço.' },
  { id: 'f5', name: 'Kiwi', price: 4.00, unit: 'kg', category: 'fruta', image: '', description: 'Kiwi verde muito saboroso, óptimo no pequeno-almoço.' },
  { id: 'f6', name: 'Laranja Nacional', price: 1.50, unit: 'kg', category: 'fruta', image: 'https://images.unsplash.com/photo-1582979512210-99b6a53386f9?w=800&auto=format&fit=crop&q=60', description: 'Laranjas ricas com imenso sumo.' },
  { id: 'f7', name: 'Manga', price: 4.50, unit: 'kg', category: 'fruta', image: 'https://images.unsplash.com/photo-1553279768-865429fa0078?w=800&auto=format&fit=crop&q=60', description: 'Manga madura tenrinha.' },
  { id: 'f8', name: 'Uvas Sem grainha', price: 5.50, unit: 'kg', category: 'fruta', image: '', description: 'Uva bagada sem grainha.' },
  { id: 'f9', name: 'Uva Red Globe', price: 4.50, unit: 'kg', category: 'fruta', image: '', description: 'Uva encarnada docinha.' },
  { id: 'f10', name: 'Maçã Golden', price: 1.90, unit: 'kg', category: 'fruta', image: '', description: 'Maçã tipo Golden macia.' },
  { id: 'f11', name: 'Maçã Royal Gala', price: 1.90, unit: 'kg', category: 'fruta', image: '', description: 'Maçã crocante.' },
  { id: 'f12', name: 'Maçã Fuji', price: 2.00, unit: 'kg', category: 'fruta', image: 'https://images.unsplash.com/photo-1567306226416-28f0efdc88ce?w=800&auto=format&fit=crop&q=60', description: 'Maçã rija com polpa bem doce.' },
  { id: 'f13', name: 'Pêra William', price: 2.50, unit: 'kg', category: 'fruta', image: '', description: 'Pêra muito sumarenta.' },
  { id: 'f14', name: 'Morangos Nacionais', price: 3.50, unit: 'kg', category: 'fruta', image: 'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=800&auto=format&fit=crop&q=60', description: 'Morangos deliciosos.' },
  { id: 'f15', name: 'Maracujá', price: 10.00, unit: 'kg', category: 'fruta', image: '', description: 'Maracujá de excelente calibre e sabor.' },
  { id: 'f16', name: 'Framboesas', price: 3.00, unit: 'covete', category: 'fruta', image: '', description: 'Framboesas cheias de sabor e com grande textura.' },
  { id: 'f17', name: 'Mirtilos', price: 2.50, unit: 'covete', category: 'fruta', image: 'https://images.unsplash.com/photo-1498557850523-fd3d118b962e?w=800&auto=format&fit=crop&q=60', description: 'Mirtilos cheios de vitaminas perfeitos como snacks.' },
  { id: 'f18', name: 'Melancia', price: 2.30, unit: 'kg', category: 'fruta', image: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=800&auto=format&fit=crop&q=60', description: 'O refresco da época de verão - melancia fresca.' },
  { id: 'f19', name: 'Nêsperas', price: 3.50, unit: 'kg', category: 'fruta', image: '', description: 'Nêsperas carnudas muito ricas.' },
  { id: 'f20', name: 'Meloas', price: 3.50, unit: 'kg', category: 'fruta', image: '', description: 'Meloa doce que se derrete na boca.' },

  // --- FRUTA DESIDRATADA ---
  { id: 'fd1', name: 'Maçã Desidratada', price: 45.00, unit: 'kg', category: 'outros', image: '', description: 'O seu snack crocante ideal.' },
  { id: 'fd2', name: 'Laranja Desidratada', price: 60.00, unit: 'kg', category: 'outros', image: '', description: 'Desidratos excelentes para guarnições ou petiscos.' },
  { id: 'fd3', name: 'Manga Desidratada', price: 55.00, unit: 'kg', category: 'outros', image: '', description: 'Docinho natural de manga.' },

  // --- FRUTOS SECOS ---
  { id: 'fs1', name: 'Figos Secos Moscatel', price: 6.00, unit: 'kg', category: 'outros', image: '', description: 'Figos deliciosos da época passada muito macios.' },

  // --- AZEITE ---
  { id: 'o1', name: 'Azeite Beira Baixa', price: 50.00, unit: 'garrafão', category: 'outros', image: '', description: 'O tempero tradicional perfeito.' },

  // --- SOPAS ---
  { id: 's1', name: 'Sopa de Legumes', price: 5.00, unit: 'litro', category: 'sopa', image: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800&auto=format&fit=crop&q=60', description: 'O caldo quentinho do conforto, purê variado de vegetais frescos.' },
  { id: 's2', name: 'Sopa de Peixe', price: 7.00, unit: 'litro', category: 'sopa', image: '', description: 'De sabor autêntico. A nossa fantástica sopa de peixe nacional.' },
  { id: 's3', name: 'Sopa da Pedra', price: 11.00, unit: 'litro', category: 'sopa', image: '', description: 'Consciência tranquila acompanhada pela clássica Sopa da Pedra de sabor rico com muitas carnes.' },
  { id: 's4', name: 'Sopa de Grão', price: 5.00, unit: 'litro', category: 'sopa', image: 'https://images.unsplash.com/photo-1603569283847-aa295f0d016a?w=800&auto=format&fit=crop&q=60', description: 'Ideal nos meses de inverno e aconchego purê excelente e rústico.' },
  { id: 's5', name: 'Sopa de Feijão', price: 5.00, unit: 'litro', category: 'sopa', image: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=800&auto=format&fit=crop&q=60', description: 'Quente e robusta - deliciosa sopa da colheita do melhor feijão.' },
];

