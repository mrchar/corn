package net.mrchar.corn.model;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.Getter;

@Getter
@Embeddable
public class Label {
    @Column(name = "label_key")
    private String key;

    @Column(name = "label_value")
    private String value;
}

