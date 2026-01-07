import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Menu, useTheme } from 'react-native-paper';
import useFinanceStore from '../src/store/useFinanceStore';

export default function ProfileSelector() {
  const { profiles, currentProfile, setCurrentProfile, notifyUpdate } = useFinanceStore();
  const [visible, setVisible] = useState(false);
  const theme = useTheme();

  const openMenu = () => setVisible(true);
  const closeMenu = () => setVisible(false);

  const handleSelect = (profile) => {
    // 1. Fecha o menu primeiro
    closeMenu();
    
    // 2. Aguarda um instante para a animação do menu terminar e não travar a UI
    // enquanto o React remonta a tela inteira com o novo perfil
    setTimeout(() => {
      setCurrentProfile(profile);
      notifyUpdate();
    }, 150);
  };

  if (!currentProfile) return null;

  return (
    <View style={styles.container}>
      <Menu
        visible={visible}
        onDismiss={closeMenu}
        anchor={
          <Button 
            mode="text" 
            onPress={openMenu}
            textColor={theme.colors.onSurface}
            icon="chevron-down"
            contentStyle={{ flexDirection: 'row-reverse' }}
            labelStyle={{ fontSize: 16, fontWeight: 'bold' }}
          >
            {currentProfile.name}
          </Button>
        }
        contentStyle={{ backgroundColor: theme.colors.elevation.level3 }}
      >
        {profiles.map((p) => (
          <Menu.Item 
            key={p.id} 
            onPress={() => handleSelect(p)} 
            title={p.name}
            leadingIcon={p.type === 'business' ? 'briefcase' : 'account'} 
          />
        ))}
      </Menu>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 1,
    marginTop: 30,
    // O zIndex ajuda o Menu a sobrepor outros elementos caso haja conflito de layout
    zIndex: 100, 
    elevation: 2, 
  }
});