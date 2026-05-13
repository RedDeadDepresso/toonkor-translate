package utils

type StringSet map[string]struct{}

func (s StringSet) Add(item string) {
    s[item] = struct{}{}
}

func (s StringSet) Has(item string) bool {
    _, ok := s[item]
    return ok
}

func (s StringSet) Remove(item string) {
    delete(s, item)
}