; ZAX lowered .asm trace
; range: $0100..$0144 (end exclusive)

; func add_to_sample begin
add_to_sample:
push IX                        ; 0100: DD E5
ld IX, $0000                   ; 0102: DD 21 00 00
add IX, SP                     ; 0106: DD 39
push AF                        ; 0108: F5
push BC                        ; 0109: C5
push DE                        ; 010A: D5
ld HL, (sample_word)           ; 010B: 2A 00 00
ld E, (IX + $0004)             ; 010E: DD 5E 04
ld D, (IX + $0005)             ; 0111: DD 56 05
xor A                          ; 0114: AF
adc HL, DE                     ; 0115: ED 5A
pop DE                         ; 0117: D1
pop BC                         ; 0118: C1
pop AF                         ; 0119: F1
ld SP, IX                      ; 011A: DD F9
pop IX                         ; 011C: DD E1
ret                            ; 011E: C9
; func add_to_sample end
; func main begin
main:
push IX                        ; 011F: DD E5
ld IX, $0000                   ; 0121: DD 21 00 00
add IX, SP                     ; 0125: DD 39
ld HL, $0000                   ; 0127: 21 00 00
push HL                        ; 012A: E5
ld A, (sample_byte)            ; 012B: 3A 00 00
ld HL, $0017                   ; 012E: 21 17 00
push HL                        ; 0131: E5
call add_to_sample             ; 0132: CD 00 00
inc SP                         ; 0135: 33
inc SP                         ; 0136: 33
ex DE, HL                      ; 0137: EB
ld (IX - $0002), E             ; 0138: DD 73 FE
ld (IX - $0001), D             ; 013B: DD 72 FF
ex DE, HL                      ; 013E: EB
ld SP, IX                      ; 013F: DD F9
pop IX                         ; 0141: DD E1
ret                            ; 0143: C9
; func main end

; symbols:
; label add_to_sample = $0100
; label main = $011F
; var sample_byte = $0144
; var sample_word = $0145
