"""Class and order for each family in species.yaml.

BioCLIP was trained on full taxonomic strings ("Animalia Chordata
Actinopterygii Centrarchiformes Centrarchidae Micropterus salmoides"), so
zero-shot prompts work best written the same way. Orders follow the
GBIF backbone.
"""

FAMILY = {
    "Acipenseridae": ("Actinopterygii", "Acipenseriformes"),
    "Alopiidae": ("Elasmobranchii", "Lamniformes"),
    "Alosidae": ("Actinopterygii", "Clupeiformes"),
    "Anoplopomatidae": ("Actinopterygii", "Perciformes"),
    "Atherinopsidae": ("Actinopterygii", "Atheriniformes"),
    "Carangidae": ("Actinopterygii", "Carangiformes"),
    "Carcharhinidae": ("Elasmobranchii", "Carcharhiniformes"),
    "Catostomidae": ("Actinopterygii", "Cypriniformes"),
    "Centrarchidae": ("Actinopterygii", "Centrarchiformes"),
    "Chimaeridae": ("Holocephali", "Chimaeriformes"),
    "Cichlidae": ("Actinopterygii", "Cichliformes"),
    "Clupeidae": ("Actinopterygii", "Clupeiformes"),
    "Coryphaenidae": ("Actinopterygii", "Carangiformes"),
    "Cottidae": ("Actinopterygii", "Perciformes"),
    "Cyprinidae": ("Actinopterygii", "Cypriniformes"),
    "Embiotocidae": ("Actinopterygii", "Perciformes"),
    "Engraulidae": ("Actinopterygii", "Clupeiformes"),
    "Esocidae": ("Actinopterygii", "Esociformes"),
    "Gadidae": ("Actinopterygii", "Gadiformes"),
    "Haemulidae": ("Actinopterygii", "Perciformes"),
    "Hexagrammidae": ("Actinopterygii", "Perciformes"),
    "Hexanchidae": ("Elasmobranchii", "Hexanchiformes"),
    "Ictaluridae": ("Actinopterygii", "Siluriformes"),
    "Istiophoridae": ("Actinopterygii", "Istiophoriformes"),
    "Kyphosidae": ("Actinopterygii", "Perciformes"),
    "Labridae": ("Actinopterygii", "Perciformes"),
    "Lamnidae": ("Elasmobranchii", "Lamniformes"),
    "Malacanthidae": ("Actinopterygii", "Perciformes"),
    "Merlucciidae": ("Actinopterygii", "Gadiformes"),
    "Moronidae": ("Actinopterygii", "Perciformes"),
    "Myliobatidae": ("Elasmobranchii", "Myliobatiformes"),
    "Paralichthyidae": ("Actinopterygii", "Pleuronectiformes"),
    "Percidae": ("Actinopterygii", "Perciformes"),
    "Pleuronectidae": ("Actinopterygii", "Pleuronectiformes"),
    "Polyprionidae": ("Actinopterygii", "Perciformes"),
    "Pomacentridae": ("Actinopterygii", "Perciformes"),
    "Rajidae": ("Elasmobranchii", "Rajiformes"),
    "Rhinobatidae": ("Elasmobranchii", "Rhinopristiformes"),
    "Salmonidae": ("Actinopterygii", "Salmoniformes"),
    "Sciaenidae": ("Actinopterygii", "Perciformes"),
    "Scombridae": ("Actinopterygii", "Scombriformes"),
    "Scorpaenidae": ("Actinopterygii", "Perciformes"),
    "Sebastidae": ("Actinopterygii", "Perciformes"),
    "Serranidae": ("Actinopterygii", "Perciformes"),
    "Sphyraenidae": ("Actinopterygii", "Carangiformes"),
    "Squalidae": ("Elasmobranchii", "Squaliformes"),
    "Stichaeidae": ("Actinopterygii", "Perciformes"),
    "Stromateidae": ("Actinopterygii", "Scombriformes"),
    "Triakidae": ("Elasmobranchii", "Carcharhiniformes"),
    "Urotrygonidae": ("Elasmobranchii", "Myliobatiformes"),
    "Xiphiidae": ("Actinopterygii", "Istiophoriformes"),
}


def taxonomic_name(family: str, scientific: str) -> str:
    cls, order = FAMILY[family]
    binomial = " ".join(scientific.split()[:2])  # drop subspecies
    return f"Animalia Chordata {cls} {order} {family} {binomial}"
