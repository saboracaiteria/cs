/^    this\.armGesture = 0;$/ {
  print "    this.armGesture = 0;";
  print "    this.aiming = false;    // [27] mirando: braços erguidos à frente com a arma";
  print "    this.weapon = null;     // arma presa à mão direita (antebraço)";
  next;
}
/ \* \[18\] Anima a caminhada\. `speed` em m\/s; 0 = parado \(respiração leve\)\.$/ {
  print "  /**";
  print "   * [27] Prende a arma na mão direita (antebraço). Ela aponta para onde";
  print "   * o braço aponta: erguida na posição de tiro, abaixada ao lado do";
  print "   * corpo quando o personagem só anda.";
  print "   */";
  print "  setWeapon(weapon) {";
  print "    this.weapon = weapon;";
  print "    this.armR.fore.add(weapon);";
  print "    weapon.visible = !this.carrying;";
  print "  }";
  print "";
  print $0;
  next;
}
/^    const moving = speed > 0\.15;$/ {
  print "    const moving = speed > 0.15;";
  print "    if (this.weapon) this.weapon.visible = !this.carrying;";
  next;
}
/^    \} else if \(this\.armGesture > 0\) \{$/ {
  print "    } else if (this.aiming) {";
  print "      // [27] posição de tiro: braços estendidos à frente segurando a pistola";
  print "      this.armR.group.rotation.x = -1.45;";
  print "      this.armR.group.rotation.z = 0.10;";
  print "      this.armR.fore.rotation.x = -0.12;";
  print "      this.armL.group.rotation.x = -1.45;";
  print "      this.armL.group.rotation.z = -0.30;   // a mão esquerda cruza e segura a frente";
  print "      this.armL.fore.rotation.x = -0.12;";
  print "    } else if (this.armGesture > 0) {";
  next;
}
{ print }
